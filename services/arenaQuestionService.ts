import { currentUserId,requireSupabase,requestError,SupabaseError } from './supabaseClient';
import { toTake } from './arenaMappers';
import { parseQuestionState } from '../utils/arenaQuestions';
import type { DbHood,TableRow } from '../supabase/types';
import type { NewTakeMedia } from './apiService';
export interface QuestionCursor {createdAt:string;id:string}
async function rpc(name:string,args:Record<string,unknown>,expectedAccount?:string):Promise<unknown> {
 const account=expectedAccount??await currentUserId();
 if(!account||await currentUserId()!==account)throw new SupabaseError('Sign in again to continue','account_changed');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try {
  const client=requireSupabase() as unknown as {rpc:(n:string,a:Record<string,unknown>)=>{abortSignal:(s:AbortSignal)=>PromiseLike<{data:unknown;error:Parameters<typeof requestError>[0]|null}>}};
  const {data,error}=await client.rpc(name,args).abortSignal(controller.signal);
  if(await currentUserId()!==account)throw new SupabaseError('Account changed','account_changed');
  if(error)throw requestError(error);
  return data;
 } finally {clearTimeout(timer);}
}
export async function fetchQuestion(id:string,account?:string){return parseQuestionState(await rpc('get_arena_question',{p_take_id:id},account),id);}
export async function voteQuestion(id:string,side:'A'|'B',revision:number,account:string){
 return parseQuestionState(await rpc('vote_arena_question',{p_take_id:id,p_side:side,p_expected_revision:revision,p_expected_auth_uid:account},account),id);
}
export async function createQuestion(text:string,hood:DbHood,a:string,b:string,account:string,media?:NewTakeMedia,topicId?:string){
 const data=await rpc('create_arena_question',{p_hood:hood,p_text:text,p_side_a:a,p_side_b:b,p_topic_id:topicId??null,
  p_media_object_id:media?.mediaObjectId??null,p_media_url:media?.url??null,p_media_poster_url:media?.posterUrl??null,p_expected_auth_uid:account},account);
 if(!Array.isArray(data)||data.length!==1||!data[0]?.question_a)throw new SupabaseError('Question could not be confirmed','bad_payload');
 return toTake(data[0] as TableRow<'takes'>);
}
export async function fetchQuestionPage(topicId?:string,cursor?:QuestionCursor){
 const data=await rpc('list_arena_questions',{p_topic_id:topicId??null,p_limit:20,
  p_cursor_at:cursor?.createdAt??null,p_cursor_id:cursor?.id??null}) as {items?:unknown;nextCursor?:QuestionCursor|null};
 if(!data||!Array.isArray(data.items)||!('nextCursor' in data))throw new SupabaseError('Invalid question page','bad_payload');
 const next=data.nextCursor;
 if(next && (typeof next.id!=='string'||typeof next.createdAt!=='string'||!Number.isFinite(Date.parse(next.createdAt))))throw new SupabaseError('Invalid question cursor','bad_payload');
 const items=data.items.map(row=>toTake(row as TableRow<'takes'>));
 if(items.length>20||items.some(row=>!row.question))throw new SupabaseError('Invalid question page','bad_payload');
 return {items,nextCursor:next??null};
}
