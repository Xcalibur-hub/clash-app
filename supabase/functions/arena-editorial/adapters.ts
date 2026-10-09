import {normalizeObservation,publicUrl,PipelineError,type Source,type Observation} from './core.ts';
export type Fetcher=typeof fetch;
export interface SourceAdapter {discover(source:Source,secret:string|undefined,now:number,maxAgeHours:number):Promise<Observation[]>}
export async function boundedText(response:Response,limit:number):Promise<string>{
 if(!response.ok||Number(response.headers.get('content-length')??0)>limit)throw new PipelineError('upstream_unavailable');
 const reader=response.body?.getReader();if(!reader)throw new PipelineError('upstream_unavailable');
 const chunks:Uint8Array[]=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new PipelineError('response_too_large');chunks.push(value);}}
 finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return new TextDecoder().decode(bytes);
}
function rssItems(xml:string):Record<string,unknown>[] {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new PipelineError('unsafe_xml');
 // Deliberately bounded RSS 2.0 subset; unsupported formats fail rather than scrape.
 if(!/<rss(?:\s|>)/i.test(xml))throw new PipelineError('unsupported_feed');
 const tag=(body:string,name:string)=>body.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1')??'';
 const language=tag(xml.replace(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi,''),'language')||null;
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,20).map(m=>({title:tag(m[1],'title'),summary:tag(m[1],'description'),url:tag(m[1],'link').replaceAll('&amp;','&'),publishedAt:tag(m[1],'pubDate'),language}));
}
export function sourceAdapter(kind:'rss'|'json',fetcher:Fetcher=fetch):SourceAdapter {
 return{async discover(source,secret,now,maxAgeHours){
  publicUrl(source.feed_url);if(source.secret_name&&!secret)throw new PipelineError('source_not_configured');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetcher(source.feed_url,{redirect:'error',signal:controller.signal,headers:{Accept:kind==='rss'?'application/rss+xml, application/xml':'application/json',...(secret?{Authorization:'Bearer '+secret}:{})}});
   const text=await boundedText(response,262144);
   let items:Record<string,unknown>[];
   if(kind==='rss')items=rssItems(text);
   else {const data=JSON.parse(text);if(!Array.isArray(data.items)||data.items.length>100)throw new PipelineError('invalid_source');items=data.items.slice(0,20);}
   const results:Observation[]=[];
   for(const item of items){try{results.push(normalizeObservation(item,source,now,maxAgeHours));}catch{/* Invalid individual items never enter candidate storage. */}}
   return results;
  }catch(e){throw e instanceof PipelineError?e:new PipelineError('source_unavailable');}finally{clearTimeout(timer);}
 }};
}
