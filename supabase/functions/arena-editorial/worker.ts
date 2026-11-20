import {PROMPT_VERSION,PipelineError,type Candidate,type Source} from './core.ts';
import {sourceAdapter,type SourceAdapter} from './adapters.ts';
import type {Generator} from './provider.ts';
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
export async function runPipeline(input:{rpc:Rpc;generator:Generator;secret:(name:string)=>string|undefined;adapter?:(kind:'rss'|'json')=>SourceAdapter;now?:()=>number}){
 const rpc=input.rpc,claim=await rpc('arena_editorial_worker',{p_action:'claim'}) as {disabled?:boolean;busy?:boolean;runId?:string;mode:string;maxAgeHours:number;sources:Source[]};
 if(claim.disabled||claim.busy)return{status:claim.disabled?'disabled':'busy',discovered:0,generated:0,published:0,failed:0,deferred:0};
 if(!claim.runId||!Array.isArray(claim.sources))throw new PipelineError('invalid_claim');
 const run=claim.runId,stats={status:'completed',discovered:0,generated:0,published:0,failed:0,deferred:0};
 const call=(action:string,data:Record<string,unknown>={})=>rpc('arena_editorial_worker',{p_action:action,p_run:run,p_data:data});
 const publish=async(id:string,version:number)=>{try{await rpc('publish_arena_editorial',{p_id:id,p_version:version,p_auto:true,p_run:run});stats.published++;}
  catch(e){stats.deferred++;await call('publication_deferred',{id,reason:e instanceof PipelineError?e.code:'publication_unavailable'});}};
 try {
  let remaining=40;
  for(const source of claim.sources.slice(0,8)){
   if(remaining<=0)break;
   try {const items=await (input.adapter??sourceAdapter)(source.adapter).discover(source,source.secret_name?input.secret(source.secret_name):undefined,(input.now??Date.now)(),claim.maxAgeHours);
    for(const item of items.slice(0,Math.min(remaining,20))){remaining--;try{const result=await call('ingest',item as unknown as Record<string,unknown>) as {duplicate?:boolean};if(!result.duplicate)stats.discovered++;}catch{stats.failed++;await call('source_failure',{sourceId:source.id});}}
   }catch{stats.failed++;await call('source_failure',{sourceId:source.id});}
  }
  const work=await call('work') as {items:Candidate[]};if(!Array.isArray(work.items))throw new PipelineError('invalid_work');
  let generationBudget=2;
  for(const candidate of work.items.slice(0,12)){
   if(candidate.status==='reviewed'){
    if(claim.mode==='LIMITED_AUTO')await publish(candidate.id,(candidate as Candidate&{generation_version:number}).generation_version);
    continue;
   }
   if(generationBudget<=0)break;generationBudget--;
   try{
    if(!input.generator.configured)throw new PipelineError('not_configured');
    const reserved=await call('begin_generation',{id:candidate.id}) as {version:number};
    const draft=await input.generator.generate(candidate);
    await call('generated',{id:candidate.id,version:reserved.version,draft,provider:input.generator.name,model:input.generator.model,promptVersion:PROMPT_VERSION});stats.generated++;
    if(claim.mode==='LIMITED_AUTO'&&!draft.needsHuman&&!draft.blocked)await publish(candidate.id,reserved.version);
   }catch(e){stats.failed++;await call('fail',{id:candidate.id,reason:e instanceof PipelineError?(e.code==='P0001'?'generation_quota':e.code):'processing_failed'});}
  }
  if(stats.failed)stats.status='partial_failure';return stats;
 }finally{await call('release');}
}
