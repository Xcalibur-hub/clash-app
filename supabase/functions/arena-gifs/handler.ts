type Config={url?:string;anonKey?:string;serviceKey?:string;providerKey?:string};
function safeMedia(value:unknown):Record<string,unknown>|null{
 if(!value||typeof value!=='object')return null;const v=value as Record<string,unknown>;
 try{const u=new URL(String(v.url));if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='tenor.com'||u.hostname.endsWith('.tenor.com')))return null;
 return {url:u.href,dims:Array.isArray(v.dims)?v.dims.slice(0,2).map(n=>typeof n==='number'&&n>0&&n<=8000?n:220):[220,220]};}catch{return null;}
}
async function bounded(body:ReadableStream<Uint8Array>|null,max:number):Promise<string>{
 if(!body)throw Error('missing_body');const reader=body.getReader();let text='',size=0;const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('too_large');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel();}
}
/** Fixed upstream, authenticated caller, fixed SQL budgets; never returns upstream diagnostics. */
export function createGifHandler(config:Config,fetcher:typeof fetch=fetch){return async(request:Request):Promise<Response>=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'unauthorized'},401);
 if(!config.url||!config.anonKey||!config.serviceKey||!config.providerKey)return json({error:'not_configured'},503);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const input=JSON.parse(await bounded(request.body,2048));
  if(!input||!['featured','search'].includes(input.path)||typeof input.query!=='string'||input.query.length>64||typeof input.pos!=='string'||input.pos.length>200)return json({error:'invalid_request'},400);
  const userResponse=await fetcher(config.url+'/auth/v1/user',{headers:{apikey:config.anonKey,Authorization:authorization},signal:controller.signal});
  if(!userResponse.ok)return json({error:'unauthorized'},401);
  const user=JSON.parse(await bounded(userResponse.body,32768));if(typeof user.id!=='string'||!user.id)return json({error:'unauthorized'},401);
  const budget=await fetcher(config.url+'/rest/v1/rpc/claim_arena_gif_request',{method:'POST',headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({p_auth_uid:user.id}),signal:controller.signal});
  if(!budget.ok){const error=JSON.parse(await bounded(budget.body,4096));return json({error:error.code==='P0001'?'rate_limited':'account_unavailable'},error.code==='P0001'?429:403);}
  const query=new URLSearchParams({key:config.providerKey,client_key:'clash_arena',media_filter:'tinygif,nanogif,gif',contentfilter:'high',limit:'24',...(input.path==='search'?{q:input.query}:{}),...(input.pos?{pos:input.pos}:{})});
  const response=await fetcher('https://tenor.googleapis.com/v2/'+input.path+'?'+query,{redirect:'error',signal:controller.signal});
  if(!response.ok)return json({error:response.status===429?'rate_limited':'provider_unavailable'},response.status===429?429:502);
  const payload=JSON.parse(await bounded(response.body,262144));if(!Array.isArray(payload.results)||payload.results.length>24)return json({error:'invalid_provider'},502);
  // Explicit projection: neither provider credentials nor arbitrary metadata is forwarded.
  return json({results:payload.results.filter((r:unknown)=>r&&typeof r==='object').map((r:Record<string,unknown>)=>({
   id:typeof r.id==='string'?r.id.slice(0,64):'',content_description:typeof r.content_description==='string'?r.content_description.slice(0,400):'',
   media_formats:Object.fromEntries(['tinygif','nanogif','gif'].map(k=>[k,safeMedia((r.media_formats as Record<string,unknown>|undefined)?.[k])])),
  })),next:typeof payload.next==='string'&&payload.next.length<=200?payload.next:null});
 }catch{return json({error:'request_unavailable'},502);}finally{clearTimeout(timer);}
};}
