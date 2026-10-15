import type { PostgrestError } from '@supabase/supabase-js';
import { currentUserId, requireSupabase, requestError, SupabaseError } from './supabaseClient';
import { acquireOfficialRequest, confirmOfficialRequest } from './officialRequestStore';
import { completeUpload, createUpload, getPublicMediaUrl, readPickedBytes, uploadFile } from './mediaService';
import type { PickedMedia } from '../hooks/useMediaPicker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PrivateAssist {
  id: string; body: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; createdAt: string;
  mediaId: string | null; mediaPath: string | null; mediaKind: 'image' | 'video' | null;
  publishedMessageId: string | null;
}
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: PostgrestError | null }> };
async function guard(account: string): Promise<void> {
  if (await currentUserId() !== account) throw new SupabaseError('Account changed', 'account_changed');
}
async function call(account: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  await guard(account);
  const { data, error } = await (requireSupabase() as unknown as RpcClient).rpc(name, args);
  await guard(account);
  if (error) throw requestError(error);
  return data;
}
export function parsePrivateAssist(raw: unknown): PrivateAssist {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid private assist');
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.body !== 'string' || typeof r.createdAt !== 'string'
    || !['PENDING','ACCEPTED','REJECTED'].includes(String(r.status))
    || ![null,'image','video'].includes(r.mediaKind as null | string)
    || !['mediaId','mediaPath','publishedMessageId'].every(k => r[k] === null || typeof r[k] === 'string')) {
    throw new Error('Invalid private assist');
  }
  return r as unknown as PrivateAssist;
}
export async function listPrivateAssists(account: string, roomId: string, cursor?: PrivateAssist): Promise<PrivateAssist[]> {
  const data = await call(account,'list_arena_private_assists',{
    p_room_id: roomId, p_before_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
  });
  if (!Array.isArray(data)) throw new Error('Invalid private inbox');
  return data.map(parsePrivateAssist);
}
export async function sendPrivateAssist(account: string, roomId: string, side: 'A' | 'B', body: string, mediaId: string | null): Promise<void> {
  const payload = { p_room_id: roomId, p_side: side, p_body: body, p_media_id: mediaId };
  const key = await acquireOfficialRequest(account,roomId,'private-assist',payload);
  await call(account,'send_arena_private_assist',{...payload,p_request_key:key});
  await confirmOfficialRequest(account,roomId,'private-assist',key);
}
export async function respondPrivateAssist(account: string, id: string, action: 'ACCEPTED' | 'REJECTED'): Promise<void> {
  await call(account,'respond_arena_private_assist',{p_id:id,p_action:action});
}
export async function privateAssistMediaUrl(account: string, assist: PrivateAssist): Promise<string> {
  if (!assist.mediaPath) throw new Error('No private media');
  await guard(account);
  const {data,error} = await requireSupabase().functions.invoke('arena-assist-media-access',{body:{assistId:assist.id}});
  await guard(account);
  if (error || !data || typeof data.url !== 'string' || data.expiresIn !== 60) throw new SupabaseError('Private media unavailable','media_access');
  // getPublicUrl only constructs a backend URL; it does not publish this asset.
  const base = new URL(requireSupabase().storage.from('private-media').getPublicUrl('').data.publicUrl);
  const signed = new URL(typeof data.relativeUrl === 'string' ? data.relativeUrl : data.url,base);
  if (signed.origin !== base.origin || !signed.pathname.startsWith('/storage/v1/object/sign/private-media/')) {
    throw new SupabaseError('Private media unavailable','media_access');
  }
  return signed.href;
}
export async function uploadPrivateAssistMedia(account: string, picked: PickedMedia): Promise<string> {
  await guard(account);
  const mime = picked.mimeType ?? (picked.kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const plan = await createUpload(picked.kind,mime,'private');
  await guard(account);
  const bytes = await readPickedBytes(picked.uri);
  await guard(account);
  await uploadFile(plan,bytes,mime);
  await guard(account);
  await completeUpload(plan.id,bytes.byteLength,{width:picked.width,height:picked.height,...(picked.durationMs ? {durationMs:picked.durationMs} : {})});
  await guard(account);
  return plan.id;
}
export async function incorporatePrivateAssist(account: string, roomId: string, assist: PrivateAssist): Promise<void> {
  // Explicit publish action copies bytes to a new fighter-owned public upload.
  // Never publish the spectator's private URL or change its visibility/owner.
  let mediaId: string | null = null, mediaUrl: string | null = null;
  const copyKey = `assist-public-copy:v1:${account}:${roomId}:${assist.id}`;
  const cached = await AsyncStorage.getItem(copyKey);
  if (cached) {
    const copy = JSON.parse(cached) as { id: string; url: string };
    if (typeof copy.id !== 'string' || typeof copy.url !== 'string') throw new Error('Invalid pending attachment');
    mediaId=copy.id; mediaUrl=copy.url;
  }
  if (assist.mediaId && assist.mediaKind && !mediaId) {
    const url = await privateAssistMediaUrl(account,assist);
    const response = await fetch(url);
    if (!response.ok) throw new SupabaseError('Private attachment expired. Try again.','media_access');
    const bytes = await response.arrayBuffer();
    await guard(account);
    const mime = response.headers.get('content-type')?.split(';')[0] ?? (assist.mediaKind === 'video' ? 'video/mp4' : 'image/jpeg');
    const plan = await createUpload(assist.mediaKind,mime,'public');
    await guard(account);
    await uploadFile(plan,bytes,mime);
    await guard(account);
    await completeUpload(plan.id,bytes.byteLength);
    mediaId = plan.id; mediaUrl = getPublicMediaUrl(plan.bucket,plan.path);
    await AsyncStorage.setItem(copyKey,JSON.stringify({id:mediaId,url:mediaUrl}));
  }
  const payload = {p_id:assist.id,p_public_media_id:mediaId,p_public_media_url:mediaUrl};
  const key = await acquireOfficialRequest(account,roomId,'incorporate-assist:'+assist.id,payload);
  await call(account,'incorporate_arena_private_assist',{...payload,p_request_key:key});
  await confirmOfficialRequest(account,roomId,'incorporate-assist:'+assist.id,key);
  await AsyncStorage.removeItem(copyKey);
}
export async function reportPrivateAssist(account: string, id: string): Promise<void> {
  await call(account,'report_arena_private_assist',{p_id:id,p_reason:'harassment'});
}
