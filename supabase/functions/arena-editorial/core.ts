export const CATEGORIES=['technology','gaming','entertainment','sports','internet_culture','science','current_affairs'] as const;
export type Category=typeof CATEGORIES[number];
export interface Source {id:string;adapter:'rss'|'json';feed_url:string;link_host:string;publisher_group:string;category:Category;credibility:number;secret_name:string|null}
export interface Observation {sourceId:string;title:string;summary:string;url:string;publishedAt:string;language:string|null;region:string|null}
export interface Candidate {id:string;title:string;summary:string;category:Category;status:string;sources:{url:string;title:string;summary:string;publishedAt:string;language?:string|null}[]}
export interface Draft {question:string;sideA:string;sideB:string;context:string;confidence:number;needsHuman:boolean;blocked:boolean;kind:string;sourceUrls:string[]}
export const PROMPT_VERSION='arena-editorial-1';
export const AUTO_TEMPLATES:Partial<Record<Category,{question:string;sideA:string;sideB:string}>>={
 technology:{question:'For this technology release, which matters more?',sideA:'More features',sideB:'Better reliability'},
 gaming:{question:'For this game release, which matters more?',sideA:'New content',sideB:'Better performance'},
 entertainment:{question:'For this film release, which matters more?',sideA:'Original stories',sideB:'Familiar characters'},
 sports:{question:'For this sports schedule, which matters more?',sideA:'More matches',sideB:'More rest'},
};
export class PipelineError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
const sensitive=/\b(alleg\w*|accus\w*|arrest\w*|crime|criminal|fraud|scam|rape|sexual|suicid\w*|kill\w*|death|died|dead|war|terror\w*|hate|racis\w*|election|politic\w*|president|minister|religio\w*|caste|medical|cancer|vaccine|disease|treatment|invest\w*|stock|profit|child\w*|minor|private|address|phone number|leak\w*|rumou?r\w*|unconfirmed|reportedly|evil|idiot\w*|stupid|obviously)\b/i;
export function publicUrl(input:string):URL {
 let u:URL;try{u=new URL(input);}catch{throw new PipelineError('invalid_url');}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||host.length>253||!host.match(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/)
  ||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)||host.includes('..')||input.length>2048)throw new PipelineError('invalid_url');
 return u;
}
export function canonicalUrl(input:string):string {const u=publicUrl(input);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))u.searchParams.delete(key);u.searchParams.sort();return u.href;}
export function plainText(value:unknown,max:number):string {
 if(typeof value!=='string')throw new PipelineError('invalid_source');
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')
  .replace(/&(?:amp|lt|gt|quot|apos|#39);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"}[x]??' '))
  .replace(/\s+/g,' ').trim().slice(0,max);
}
export function normalizeObservation(raw:Record<string,unknown>,source:Source,now:number,maxAgeHours:number):Observation {
 if(!CATEGORIES.includes(source.category))throw new PipelineError('unsupported_category');
 const title=plainText(raw.title,200),summary=plainText(raw.summary??'',400),url=canonicalUrl(String(raw.url??''));
 const timestamp=typeof raw.publishedAt==='string'?Date.parse(raw.publishedAt):NaN;
 if(title.length<3||!Number.isFinite(timestamp)||timestamp<now-maxAgeHours*3600000||timestamp>now+300000||publicUrl(url).hostname!==source.link_host)throw new PipelineError('invalid_or_expired_source');
 return{sourceId:source.id,title,summary,url,publishedAt:new Date(timestamp).toISOString(),language:typeof raw.language==='string'?raw.language.slice(0,12):null,region:typeof raw.region==='string'?raw.region.slice(0,40):null};
}
export function validateDraft(value:unknown,candidate:Candidate):Draft {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PipelineError('invalid_generation');
 const v=value as Record<string,unknown>;
 for(const [key,max] of [['question',180],['sideA',60],['sideB',60],['context',400],['kind',40]] as const){
  if(typeof v[key]!=='string'||!(v[key] as string).trim()||(v[key] as string).length>max||/<[^>]+>/.test(v[key] as string))throw new PipelineError('invalid_generation');
 }
 if((v.sideA as string).trim().toLowerCase()===(v.sideB as string).trim().toLowerCase()||typeof v.confidence!=='number'||!Number.isFinite(v.confidence)||v.confidence<0||v.confidence>1
  ||typeof v.needsHuman!=='boolean'||typeof v.blocked!=='boolean'||!Array.isArray(v.sourceUrls)||v.sourceUrls.length<1||v.sourceUrls.length>8
  ||new Set(v.sourceUrls).size!==v.sourceUrls.length||v.sourceUrls.some(u=>typeof u!=='string'||!candidate.sources.some(s=>s.url===u)))throw new PipelineError('invalid_generation');
 const d=v as unknown as Draft,words=[candidate.title,candidate.summary,d.question,d.sideA,d.sideB,d.context].join(' ');
 const blocked=d.blocked||/\b(doxx?\w*|rape|suicid\w*|kill|inferior|subhuman)\b/i.test([d.question,d.sideA,d.sideB].join(' '));
 return{question:d.question.trim(),sideA:d.sideA.trim(),sideB:d.sideB.trim(),context:d.context.trim(),kind:d.kind,
  confidence:d.confidence,sourceUrls:d.sourceUrls,blocked,needsHuman:d.needsHuman||sensitive.test(words)||['science','internet_culture','current_affairs'].includes(candidate.category)||candidate.sources.some(s=>!/^en(-[A-Za-z]{2})?$/.test(s.language??''))||d.confidence<0.95};
}

/** Explainable signal preview; SQL recomputes authoritative rank from stored sources. */
export function rankPreview(ageHours:number,credibility:number,independent:number,signals:Partial<{sourceDomains:number;interestMatches:number;discussionPotential:number;overlap:boolean}>={}):number {
 const features={sourceDomains:independent,interestMatches:0,discussionPotential:0.5,overlap:false,...signals};
 return Math.round((Math.max(0,25-ageHours)+credibility*35+Math.min(independent,3)*10+Math.min(features.sourceDomains,3)*2+Math.min(features.interestMatches,10)+features.discussionPotential*5-(features.overlap?100:0))*1000)/1000;
}
