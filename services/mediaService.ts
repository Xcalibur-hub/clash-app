/**
 * Media operations — the only place the app talks to Supabase Storage. UI never
 * touches storage directly, so a future CDN, transcoding pipeline or signed-URL
 * provider stays contained here.
 */

import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type { Json, MediaVisibility } from '../supabase/types';
import type { MediaKind } from '../store/types';

export interface MediaUploadPlan {
  id: string;
  bucket: 'public-media' | 'private-media';
  path: string;
  sizeLimit: number;
}

export type UploadBody = Blob | ArrayBuffer | string;

function toUploadPlan(payload: Json | null): MediaUploadPlan {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { [key: string]: Json | undefined };
    const id = record.id;
    const bucket = record.bucket;
    const path = record.path;
    const sizeLimit = record.size_limit;
    if (
      typeof id === 'string' &&
      (bucket === 'public-media' || bucket === 'private-media') &&
      typeof path === 'string' &&
      typeof sizeLimit === 'number'
    ) {
      return { id, bucket, path, sizeLimit };
    }
  }
  throw new SupabaseError('create_media_upload returned an unexpected payload', 'bad_payload');
}

/** Start an upload: the server approves a path and returns the permitted plan. */
export async function createUpload(
  kind: MediaKind,
  mimeType: string,
  visibility: MediaVisibility = 'public',
): Promise<MediaUploadPlan> {
  const { data, error } = await requireSupabase().rpc('create_media_upload', {
    p_media_kind: kind,
    p_mime_type: mimeType,
    p_visibility: visibility,
  });
  if (error) throw requestError(error);
  return toUploadPlan(data);
}

/** Upload the bytes to the approved path. Never `upsert` — the path is fresh. */
export async function uploadFile(plan: MediaUploadPlan, file: UploadBody, contentType: string): Promise<void> {
  const { error } = await requireSupabase()
    .storage.from(plan.bucket)
    .upload(plan.path, file, { contentType, upsert: false });
  if (error) throw new SupabaseError(error.message, 'media_upload');
}

/**
 * Read a locally picked asset (`file://` URI) into an ArrayBuffer for upload.
 * Uses the runtime's fetch so the picker stays decoupled from storage — the UI
 * never touches Blob/Storage plumbing directly.
 */
export async function readPickedBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new SupabaseError('The selected file could not be read.', 'media_read');
  }
  return buffer;
}

export interface MediaDimensions {
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Mark an upload ready; the server verifies the object actually exists. */
export async function completeUpload(mediaId: string, sizeBytes: number, dimensions?: MediaDimensions): Promise<void> {
  const { error } = await requireSupabase().rpc('complete_media_upload', {
    p_media_id: mediaId,
    p_size_bytes: sizeBytes,
    p_width: dimensions?.width,
    p_height: dimensions?.height,
    p_duration_ms: dimensions?.durationMs,
  });
  if (error) throw requestError(error);
}

/** Mark an upload failed so a stale record never reads as ready. */
export async function failUpload(mediaId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('fail_media_upload', { p_media_id: mediaId });
  if (error) throw requestError(error);
}

/** Remove the storage object, then tombstone the media record. */
export async function deleteMedia(mediaId: string, bucket: string, path: string): Promise<void> {
  await requireSupabase().storage.from(bucket).remove([path]);
  const { error } = await requireSupabase().rpc('delete_media', { p_media_id: mediaId });
  if (error) throw requestError(error);
}

/** Permanent URL for public media only. */
export function getPublicMediaUrl(bucket: string, path: string): string {
  return requireSupabase().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Future Vault private-media access: a short-lived signed URL after an
 * entitlement check. Deliberately not implemented — private media must never be
 * reachable through a permanent public URL.
 */
export async function getPrivateMediaAccess(_mediaId: string): Promise<never> {
  throw new SupabaseError('Private media access is not implemented yet.', 'not_implemented');
}
