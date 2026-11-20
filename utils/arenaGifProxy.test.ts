import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {createGifHandler} from '../supabase/functions/arena-gifs/handler.ts';
const config={url:'https://database.example.org',anonKey:'public-anon',serviceKey:'private-service',providerKey:'private-provider'};
const request=(body:unknown={path:'search',query:'hello',pos:''},auth=true)=>new Request('https://worker.example.org',{method:'POST',headers:auth?{Authorization:'Bearer mock-user'}:{},body:JSON.stringify(body)});
describe('authenticated GIF server boundary',()=>{
 it('rejects missing authorization, configuration and invalid input before upstream calls',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected');};
  assert.equal((await createGifHandler(config,fetcher)(request({},false))).status,401);
  assert.equal((await createGifHandler({...config,providerKey:undefined},fetcher)(request())).status,503);
  assert.equal((await createGifHandler(config,fetcher)(request({path:'https://evil.example',query:'',pos:''}))).status,400);
  assert.equal(calls,0);
 });
 it('denies invalid JWTs before quota or provider use',async()=>{
  let calls=0;const handler=createGifHandler(config,async()=>{calls++;return new Response('{}',{status:401});});
  assert.equal((await handler(request())).status,401);assert.equal(calls,1);
 });
 it('enforces provider quota without leaking server diagnostics',async()=>{
  let calls=0;const handler=createGifHandler(config,async()=>++calls===1?new Response('{"id":"verified-user"}'):new Response('{"code":"P0001","message":"private-service"}',{status:400}));
  const response=await handler(request());assert.equal(response.status,429);assert.deepEqual(await response.json(),{error:'rate_limited'});assert.equal(calls,2);
 });
 it('uses verified identity, fixed upstream, timeout, safe formats and bounded projection',async()=>{
  const calls:string[]=[];const handler=createGifHandler(config,async(url,opts)=>{calls.push(String(url));assert.ok(opts?.signal);
   if(calls.length===1)return new Response('{"id":"verified-user"}');
   if(calls.length===2){assert.equal(JSON.parse(String(opts?.body)).p_auth_uid,'verified-user');return new Response('');}
   assert.equal(opts?.redirect,'error');assert.match(String(url),/^https:\/\/tenor.googleapis.com\/v2\/search\?/);
   return new Response(JSON.stringify({secret:'private-service',results:[{id:'gif',content_description:'Hello',media_formats:{tinygif:{url:'https://media.tenor.com/a.gif',dims:[200,200],secret:'private-provider'},gif:{url:'https://evil.example/a.gif'}}}],next:'next'}));
  });const response=await handler(request()),text=await response.text();assert.equal(response.status,200);assert.ok(!text.includes('private-'));assert.ok(!text.includes('evil.example'));assert.equal(calls.length,3);
 });
 it('bounds request/provider bodies and reports outages honestly',async()=>{
  assert.equal((await createGifHandler(config)(request({path:'search',query:'x'.repeat(3000),pos:''}))).status,502);
  let calls=0;const handler=createGifHandler(config,async()=>{calls++;if(calls===1)return new Response('{"id":"user"}');if(calls===2)return new Response('');throw Error('secret diagnostic');});
  const response=await handler(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'request_unavailable'});
 });
});
