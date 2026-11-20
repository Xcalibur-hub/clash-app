export interface QuestionChoices { sideA:string; sideB:string; topicId:string|null; origin:'human'|'editorial'; sourceUrl:string|null;
 aiGenerated?:boolean;context?:string;sources?:{url:string;title:string;publisher:string}[] }
export interface QuestionState {
 takeId:string; sideA:string; sideB:string; status:'open'|'closed'; expiresAt:string;
 countA:number; countB:number; total:number; mySide:'A'|'B'|null; revision:number;
}
export function validQuestionChoices(a:string,b:string):boolean {
 return [a,b].every(v=>v.trim().length>0 && v.trim().length<=60 && /[\p{L}\p{N}]/u.test(v)) && a.trim().toLocaleLowerCase()!==b.trim().toLocaleLowerCase();
}
export function questionChoices(row:object):QuestionChoices|undefined {
 const r=row as Record<string,unknown>;
 if(typeof r.question_a!=='string'||typeof r.question_b!=='string')return undefined;
 if(!validQuestionChoices(r.question_a,r.question_b)||!['human','editorial'].includes(String(r.question_origin)))throw new Error('Invalid question choices');
 const metadata:Partial<QuestionChoices>={};
 if(r.question_ai_generated===true){
  if(r.question_origin!=='editorial'||typeof r.question_context!=='string'||r.question_context.length>400||!Array.isArray(r.question_sources)||r.question_sources.length<1||r.question_sources.length>8)throw new Error('Invalid editorial metadata');
  const sources=r.question_sources as NonNullable<QuestionChoices['sources']>;
  if(sources.some(s=>!s||typeof s.url!=='string'||!safeQuestionSource(s.url)||typeof s.title!=='string'||typeof s.publisher!=='string'))throw new Error('Invalid editorial attribution');
  metadata.aiGenerated=true;metadata.context=r.question_context;metadata.sources=sources;
 }
 return {sideA:r.question_a,sideB:r.question_b,topicId:typeof r.question_topic_id==='string'?r.question_topic_id:null,
  origin:r.question_origin as 'human'|'editorial',sourceUrl:typeof r.question_source_url==='string'?r.question_source_url:null,...metadata};
}
export function safeQuestionSource(value:string):boolean {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&value.length<=2048;}catch{return false;}}
export function parseQuestionState(value:unknown,id:string):QuestionState {
 const r=value as QuestionState|null;
 if(!r||typeof r!=='object'||r.takeId!==id||typeof r.sideA!=='string'||typeof r.sideB!=='string'||!validQuestionChoices(r.sideA,r.sideB)
  ||!['open','closed'].includes(r.status)||typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt))
  ||![r.countA,r.countB,r.total,r.revision].every(n=>Number.isSafeInteger(n)&&n>=0)||r.countA+r.countB!==r.total
  ||(r.mySide!==null&&r.mySide!=='A'&&r.mySide!=='B')||(r.mySide===null?r.revision!==0:r.revision<1))throw new Error('Invalid question response');
 return r;
}
export function questionPercent(count:number,total:number):string|null {return total>0?`${Math.round(100*count/total)}%`:null;}
