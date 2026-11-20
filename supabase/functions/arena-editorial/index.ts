import {generator} from './provider.ts';
import {runPipeline,type Rpc} from './worker.ts';
import {boundedText} from './adapters.ts';
import {PipelineError} from './core.ts';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
const env=(name:string)=>Deno.env.get(name);
export function authorized(provided:string|null,expected:string|undefined):boolean {
 if(!expected||expected.length<32||!provided||provided.length!==expected.length)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=provided.charCodeAt(i)^expected.charCodeAt(i);return difference===0;
}
Deno.serve(async request=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!authorized(request.headers.get('x-editorial-secret'),env('ARENA_EDITORIAL_RUN_SECRET')))return json({error:'unauthorized'},401);
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json({error:'not_configured'},503);
 const rpc:Rpc=async(name,args)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:controller.signal});
   const payload=JSON.parse(await boundedText(new Response(response.body,{headers:response.headers}),524288));
   if(!response.ok)throw new PipelineError(['42501','P0001','P0006','22023','40001'].includes(payload?.code)?payload.code:'database_unavailable');
   return payload;
  }finally{clearTimeout(timer);}
 };
 try{return json(await runPipeline({rpc,generator:generator({key:env('ARENA_AI_API_KEY'),model:env('ARENA_AI_MODEL'),baseUrl:env('ARENA_AI_BASE_URL')}),secret:env}));}
 catch{return json({error:'pipeline_failed'},503);}
});
