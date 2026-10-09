import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {publicUrl,canonicalUrl,normalizeObservation,validateDraft,rankPreview,AUTO_TEMPLATES,type Source,type Candidate} from '../supabase/functions/arena-editorial/core.ts';
import {sourceAdapter,boundedText} from '../supabase/functions/arena-editorial/adapters.ts';
import {generator} from '../supabase/functions/arena-editorial/provider.ts';
import {runPipeline} from '../supabase/functions/arena-editorial/worker.ts';
const now=Date.parse('2026-10-09T10:00:00Z');
const source:Source={id:'source',adapter:'rss',feed_url:'https://news.example.org/rss',link_host:'news.example.org',publisher_group:'independent-publisher',category:'technology',credibility:0.9,secret_name:null};
const observation={title:'Orion software release adds offline features',summary:'Orion announced an offline software release.',url:'https://news.example.org/story',publishedAt:'2026-10-09T08:00:00Z'};
const candidate:Candidate={id:'candidate',title:observation.title,summary:observation.summary,category:'technology',status:'verified',sources:[{...observation,language:'en'}]};
const draft={...AUTO_TEMPLATES.technology!,context:observation.summary,confidence:0.97,needsHuman:false,blocked:false,kind:'release_or_schedule',sourceUrls:[observation.url]};
describe('editorial normalization and safety',()=>{
 it('requires public HTTPS endpoints and prevents credentials, local/IP targets and redirects',()=>{
  for(const url of ['http://example.org/a','https://127.0.0.1/a','https://[::1]/a','https://server.local/a','https://a.internal/a','https://user:secret@example.org/a','https://example.org:8080/a'])assert.throws(()=>publicUrl(url));
  assert.equal(canonicalUrl('https://news.example.org/story?utm_source=x&b=2&a=1#top'),'https://news.example.org/story?a=1&b=2');
 });
 it('normalizes bounded summaries without copying articles or inventing location',()=>{
  const row=normalizeObservation({...observation,title:'<b>Orion</b> release',summary:'<p>'+ 'x'.repeat(1000)+'</p>'},source,now,48);
  assert.equal(row.title,'Orion release');assert.equal(row.summary.length,400);assert.equal(row.region,null);assert.equal(row.language,null);
 });
 it('rejects missing timestamps, expired/future sources and unsupported categories',()=>{
  for(const patch of [{publishedAt:null},{publishedAt:'2026-10-01T00:00:00Z'},{publishedAt:'2026-10-10T00:00:00Z'},{url:'https://foreign.example.org/a'}])assert.throws(()=>normalizeObservation({...observation,...patch},source,now,48));
  assert.throws(()=>normalizeObservation(observation,{...source,category:'unknown'} as unknown as Source,now,48));
 });
 it('accepts a grounded neutral question and rejects hallucinated references',()=>{
  assert.equal(validateDraft(draft,candidate).needsHuman,false);
  assert.throws(()=>validateDraft({...draft,sourceUrls:['https://fabricated.example.org/article']},candidate));
  assert.throws(()=>validateDraft({...draft,sourceUrls:[observation.url,observation.url]},candidate));
 });
 it('rejects malformed or false-binary options and enforces text bounds',()=>{
  for(const patch of [{question:'q'.repeat(181)},{sideA:'Yes',sideB:' YES '},{confidence:1.1},{confidence:'high'},{blocked:null},{sourceUrls:[]},{context:''},{sideA:'x'.repeat(61)}])assert.throws(()=>validateDraft({...draft,...patch},candidate));
 });
 it('forces uncertain, sensitive and high-risk categories into review',()=>{
  assert.equal(validateDraft({...draft,confidence:0.8},candidate).needsHuman,true);
  assert.equal(validateDraft({...draft,question:'Should the accused minister resign?'},candidate).needsHuman,true);
  for(const category of ['science','internet_culture','current_affairs'] as const)assert.equal(validateDraft(draft,{...candidate,category}).needsHuman,true);
  assert.equal(validateDraft({...draft,question:'Should we leak a private address?'},candidate).needsHuman,true);
  assert.equal(validateDraft({...draft,question:'Should we doxx this person?'},candidate).blocked,true);
 });
 it('has explainable freshness, credibility and independent confirmation signals',()=>{
  assert.ok(rankPreview(1,0.9,2)>rankPreview(24,0.9,2));assert.ok(rankPreview(1,0.9,2)>rankPreview(1,0.9,1));assert.equal(rankPreview(1,0.9,3),rankPreview(1,0.9,8));
  assert.ok(rankPreview(1,0.9,2,{interestMatches:10})>rankPreview(1,0.9,2));
  assert.ok(rankPreview(1,0.9,2,{overlap:true})<rankPreview(1,0.9,2));
 });
});
describe('authorized source adapters',()=>{
 it('parses permitted RSS data only with bounded fetch and no follow redirects',async()=>{
  let options:RequestInit|undefined;
  const adapter=sourceAdapter('rss',async(_url,opts)=>{options=opts;return new Response(`<rss><channel><item><title>${observation.title}</title><description><![CDATA[${observation.summary}]]></description><link>${observation.url}</link><pubDate>Fri, 09 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`);});
  const rows=await adapter.discover(source,undefined,now,48);assert.equal(rows.length,1);assert.equal(rows[0].summary,observation.summary);assert.equal(options?.redirect,'error');assert.ok(options?.signal);
 });
 it('rejects entity expansion and unsupported HTML feeds',async()=>{
  for(const body of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>','<html>restricted website</html>'])await assert.rejects(sourceAdapter('rss',async()=>new Response(body)).discover(source,undefined,now,48));
 });
 it('handles missing source credentials without a network request',async()=>{
  let calls=0;await assert.rejects(sourceAdapter('json',async()=>{calls++;return new Response('{}');}).discover({...source,adapter:'json',secret_name:'ARENA_SOURCE_NEWS'},undefined,now,48));assert.equal(calls,0);
 });
 it('uses authorized JSON feeds and drops malformed/expired individual items',async()=>{
  const rows=await sourceAdapter('json',async()=>new Response(JSON.stringify({items:[observation,{...observation,publishedAt:'old'},{title:'malformed'}]}))).discover({...source,adapter:'json'},undefined,now,48);assert.equal(rows.length,1);
 });
 it('bounds streamed response sizes and treats upstream outages as failures',async()=>{
  await assert.rejects(boundedText(new Response('x'.repeat(100)),50));
  await assert.rejects(sourceAdapter('json',async()=>new Response('upstream private diagnostic',{status:429})).discover(source,undefined,now,48),e=>!String(e).includes('private diagnostic'));
 });
});
describe('provider abstraction',()=>{
 it('never calls an AI provider without explicit key and model',async()=>{
  let calls=0;const p=generator({},async()=>{calls++;throw Error('should not call');});assert.equal(p.configured,false);await assert.rejects(p.generate(candidate),{code:'not_configured'});assert.equal(calls,0);
 });
 it('validates the configured provider output and keeps untrusted sources in data',async()=>{
  let body:Record<string,unknown>|undefined;
  const p=generator({key:'mock-key',model:'mock-model'},async(_url,opts)=>{body=JSON.parse(String(opts?.body));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]}));});
  assert.deepEqual(await p.generate(candidate),draft);assert.equal(body?.max_completion_tokens,700);assert.deepEqual(body?.response_format,{type:'json_object'});assert.match(JSON.stringify(body?.messages),/untrusted data/);
 });
 it('rejects malformed, truncated, unsafe and fabricated output without exposing secrets',async()=>{
  for(const payload of [{choices:[]},{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{finish_reason:'stop',message:{content:JSON.stringify({...draft,sourceUrls:['https://fiction.example.org/a']})}}]}])await assert.rejects(generator({key:'mock-secret',model:'mock'},async()=>new Response(JSON.stringify(payload))).generate(candidate));
  await assert.rejects(generator({key:'mock-secret',model:'mock'},async()=>new Response('mock-secret',{status:401})).generate(candidate),e=>!String(e).includes('mock-secret'));
 });
});
describe('bounded worker orchestration',()=>{
 function harness(mode='REVIEW_ONLY',configured=true){
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const rpc=async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});if(args.p_action==='claim')return{runId:'lease',mode,maxAgeHours:48,sources:[source]};if(args.p_action==='work')return{items:Array.from({length:20},(_,i)=>({...candidate,id:'c'+i}))};if(args.p_action==='begin_generation')return{version:1};return{};};
  let generated=0;return{calls,input:{rpc,secret:()=>undefined,now:()=>now,adapter:()=>({discover:async()=>[normalizeObservation(observation,source,now,48)]}),generator:{configured,name:'mock',model:'mock',generate:async()=>{generated++;return draft;}}},generated:()=>generated};
 }
 it('OFF/paused/busy claim prevents all discovery and generation',async()=>{
  let calls=0;for(const claim of [{disabled:true},{busy:true}]){const result=await runPipeline({rpc:async()=>claim,secret:()=>undefined,generator:{configured:true,name:'mock',model:'mock',generate:async()=>{calls++;return draft;}},adapter:()=>({discover:async()=>{calls++;return[];}})});assert.ok(['disabled','busy'].includes(result.status));}assert.equal(calls,0);
 });
 it('review-only never publishes and limits generations per run',async()=>{
  const h=harness();const r=await runPipeline(h.input);assert.equal(h.generated(),2);assert.equal(r.generated,2);assert.equal(r.published,0);assert.ok(!h.calls.some(c=>c.name==='publish_arena_editorial'));assert.equal(h.calls.at(-1)?.args.p_action,'release');
 });
 it('missing AI configuration records safe visible failures without generation quota',async()=>{
  const h=harness('REVIEW_ONLY',false);const r=await runPipeline(h.input);assert.equal(r.status,'partial_failure');assert.equal(h.generated(),0);assert.ok(!h.calls.some(c=>c.args.p_action==='begin_generation'));assert.equal((h.calls.find(c=>c.args.p_action==='fail')?.args.p_data as {reason:string}).reason,'not_configured');
 });
 it('LIMITED_AUTO requests publication only through authoritative RPC',async()=>{
  const h=harness('LIMITED_AUTO');const r=await runPipeline(h.input);assert.equal(r.published,2);const publication=h.calls.find(c=>c.name==='publish_arena_editorial');assert.equal(publication?.args.p_auto,true);assert.equal(publication?.args.p_run,'lease');
 });
 it('source outages are visible and do not claim a fully successful run',async()=>{
  const h=harness();h.input.adapter=()=>({discover:async()=>{throw Error('upstream secret');}});const r=await runPipeline(h.input);assert.equal(r.failed,1);assert.equal(r.status,'partial_failure');assert.ok(h.calls.some(c=>c.args.p_action==='source_failure'));assert.ok(!JSON.stringify(h.calls).includes('upstream secret'));
 });
});
