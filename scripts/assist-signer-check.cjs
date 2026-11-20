const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module');
const file=require('node:path').resolve('supabase/functions/arena-assist-media-access/handler.ts'),m=new Module(file,module);
m._compile(require('@babel/core').transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']}).code,file);
const {createAssistMediaHandler}=m.exports;
const id='00000000-0000-0000-0000-000000003111',media={bucket:'private-media',path:'owner/image.png',mediaKind:'image'};
let calls=[],scenario='',checks=0,count=0;
const config={url:'https://isolated.invalid',anonKey:'anon-fixture',serviceKey:'SERVER-SECRET-FIXTURE'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const transport=async(url,args)=>{calls.push({url,args});
 if(url.includes('/auth/'))return scenario==='invalid-auth'?reply({},401):reply({id:'caller'});
 if(url.includes('/rpc/')){assert.equal(args.headers.Authorization,'Bearer user-fixture');assert.equal(args.headers.apikey,config.anonKey);assert.deepEqual(JSON.parse(args.body),{p_id:id});checks++;
 if(scenario==='rate')return reply({code:'P0001'},400);
 return reply(scenario==='denied'||(scenario==='revoked'&&checks===2)?null:scenario==='bad-target'?{...media,bucket:'public-media'}:media);}
 assert.ok(url.endsWith('/storage/v1/object/sign/private-media/owner/image.png'));assert.equal(args.headers.Authorization,'Bearer '+config.serviceKey);assert.deepEqual(JSON.parse(args.body),{expiresIn:60});
 if(scenario==='sign-fails')return reply({error:'private error '+config.serviceKey},500);
 if(scenario==='throws')throw Error(config.serviceKey);
 return reply({signedURL:scenario==='bad-url'?'https://foreign.invalid/steal':'/object/sign/private-media/owner/image.png?token=fixture'});
};
async function test(label,mode,status,body={assistId:id},auth=true){scenario=mode;calls=[];checks=0;const response=await createAssistMediaHandler(config,transport)(new Request('https://edge.invalid',{method:'POST',headers:auth?{Authorization:'Bearer user-fixture'}:{},body:JSON.stringify(body)}));assert.equal(response.status,status,label);const text=await response.text();assert.ok(!text.includes(config.serviceKey));assert.equal(response.headers.get('cache-control'),'no-store');if(status===403&&mode!=='revoked')assert.ok(!calls.some(c=>c.url.includes('/storage/')));count++;console.log('PASS '+label);return text;}
(async()=>{
 await test('missing authentication never touches upstreams','',401,undefined,false);assert.equal(calls.length,0);
 await test('invalid user token denied','invalid-auth',401);
 await test('known assist ID without entitlement denied','denied',403);
 await test('caller-supplied object path rejected','',400,{assistId:id,path:'victim/private.png'});
 await test('invalid assist identifier rejected','',400,{assistId:'arbitrary'});
 await test('oversized input rejected','',400,{assistId:'x'.repeat(2048)});
 await test('unexpected bucket cannot be signed','bad-target',403);
 await test('signing budget denial is truthful','rate',429);
 await test('Storage failure does not disclose diagnostics','sign-fails',502);
 await test('thrown secret-bearing error redacted','throws',502);
 await test('unexpected signed URL rejected','bad-url',502);
 await test('revocation while signing suppresses capability','revoked',403);
 const out=JSON.parse(await test('exact authorized object signed for sixty seconds','',200));assert.equal(checks,2);assert.ok(out.relativeUrl.startsWith('/storage/v1/object/sign/private-media/'));assert.ok(!out.relativeUrl.includes('isolated.invalid'));assert.equal(out.url,config.url+out.relativeUrl);
 const source=fs.readFileSync('supabase/migrations/20261014122051_canonical_arena_assist_rpcs.sql','utf8');assert.ok(!/create\s+policy[^;]*storage\.objects/i.test(source));count++;console.log('PASS assist migration has no managed Storage policy DDL');
 console.log(`${count}/${count} signer checks passed; mocked upstreams.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
