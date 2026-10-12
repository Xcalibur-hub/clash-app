const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {frozen}=require('../isolated-supabase/prepare.cjs');
const {generate,prepare,verify}=require('../../scripts/migration-compatibility-artifact.cjs');
function bundle(){const files=frozen().files;const suites=files.filter(f=>f.path.startsWith('supabase/tests/')).sort((a,b)=>a.path.localeCompare(b.path)).map(f=>{return {name:path.basename(f.path),source_sha256:f.sha256,sql:f.bytes.toString('utf8')};});
 const hashes=require('./suite-hashes.json');assert.deepEqual(Object.fromEntries(suites.map(s=>[s.name,s.source_sha256])),hashes);
 return {candidate:'a92a550527f810913b01f6e6411dc78996c71a06',suites};}
if(require.main===module){const root=path.resolve(__dirname,'../..'),scratch=path.join(root,'.expo');fs.mkdirSync(scratch,{recursive:true});const dest=path.join(scratch,'migration-compatibility-hosted-5u-final');const b=bundle();generate(scratch,dest);verify(dest,prepare());const bytes=Buffer.from(JSON.stringify(b,null,2)+'\n');fs.writeFileSync(path.join(dest,'hosted-suites.json'),bytes,{flag:'wx'});const {hash}=require('../isolated-supabase/prepare.cjs');console.log(JSON.stringify({artifact_dir:dest,artifact_manifest_sha256:hash(fs.readFileSync(path.join(dest,'compatibility-manifest.json'))),suite_manifest_sha256:hash(bytes),migrations:106,adapted_suites:10,total_suites:b.suites.length,source_hashes:245,sql_executed:false}));}
module.exports={bundle};
