import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
let handler:(r:Request)=>Promise<Response>;
const secrets:Record<string,string|undefined>={ARENA_EDITORIAL_RUN_SECRET:'test-only-secret-'.repeat(3),SUPABASE_URL:'https://database.example.org',SUPABASE_SERVICE_ROLE_KEY:'mock-service-key'};
(globalThis as unknown as {Deno:unknown}).Deno={env:{get:(key:string)=>secrets[key]},serve:(fn:typeof handler)=>{handler=fn;}};
const {authorized}=await import('../supabase/functions/arena-editorial/index.ts');
describe('server worker invocation boundary',()=>{
 it('requires an explicit sufficiently long server secret',()=>{
  assert.equal(authorized(null,secrets.ARENA_EDITORIAL_RUN_SECRET),false);assert.equal(authorized('short','short'),false);
  assert.equal(authorized('wrong',secrets.ARENA_EDITORIAL_RUN_SECRET),false);assert.equal(authorized(secrets.ARENA_EDITORIAL_RUN_SECRET!,secrets.ARENA_EDITORIAL_RUN_SECRET),true);
 });
 it('rejects unauthenticated and wrong-method requests before any network call',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not call');};
  try{assert.equal((await handler(new Request('https://worker.example.org'))).status,405);assert.equal((await handler(new Request('https://worker.example.org',{method:'POST'}))).status,401);assert.equal(calls,0);}finally{globalThis.fetch=original;}
 });
 it('returns disabled status without invoking sources or providers',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{calls++;assert.match(String(url),/\/rpc\/arena_editorial_worker$/);assert.equal(JSON.parse(String(opts?.body)).p_action,'claim');return new Response('{"disabled":true}');};
  try{const response=await handler(new Request('https://worker.example.org',{method:'POST',headers:{'x-editorial-secret':secrets.ARENA_EDITORIAL_RUN_SECRET!}}));assert.equal(response.status,200);const text=await response.text();assert.match(text,/disabled/);assert.ok(!text.includes('mock-service-key'));assert.equal(calls,1);}finally{globalThis.fetch=original;}
 });
 it('reports database failures with no raw diagnostics or secret disclosure',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{"code":"42501","message":"private mock-service-key diagnostic"}',{status:403});
  try{const response=await handler(new Request('https://worker.example.org',{method:'POST',headers:{'x-editorial-secret':secrets.ARENA_EDITORIAL_RUN_SECRET!}}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'pipeline_failed'});}finally{globalThis.fetch=original;}
 });
});
