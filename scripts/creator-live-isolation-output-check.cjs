// Validates captured native isolationtester output; never opens a DB connection.
const assert=require('node:assert/strict');
const fs=require('node:fs');
function checkOutput({stdout,stderr,status,spec}){
  assert.equal(status,0,'native tester did not exit successfully');
  assert.doesNotMatch(stdout+'\n'+stderr,/^(?:ERROR:|FATAL:|PANIC:|setup failed:|teardown.*failed:|failed to complete|isolationtester: canceling)/mi,'SQL/setup/teardown failure');
  const planned=[...spec.matchAll(/^permutation (.+)$/gm)].map(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]));
  const runs=[...stdout.matchAll(/^starting permutation:([^\r\n]*)\r?\n([\s\S]*?)(?=^starting permutation:|$(?![\s\S]))/gm)];
  assert.equal(planned.length,10);assert.equal(runs.length,planned.length,'missing/extra permutations');
  const waiting=['o_end','o_open_denied','h_close','w_vote','v_deadline','v_approval_denied','v_approval_denied','r_revoke','v_subscription_denied','v_deadline'];
  runs.forEach((run,i)=>{
    assert.deepEqual(run[1].trim().split(/\s+/),planned[i],'wrong permutation order');
    for(const step of planned[i])assert.match(run[2],new RegExp('^step '+step+':','m'),'missing executed step '+step);
    const step=waiting[i];
    assert.match(run[2],new RegExp('^step '+step+': (?:(?!^step )[\\s\\S])*?<waiting \\.\\.\\.>','m'),'no observed wait for '+step);
    assert.match(run[2],new RegExp('^step '+step+': <\\.\\.\\. completed>','m'),'wait never completed for '+step);
  });
  return {permutations:runs.length,observedWaits:runs.length,status:'PASS'};
}
module.exports={checkOutput};
if(require.main===module){
  try{
    const[out,err,status]=process.argv.slice(2);assert.ok(out&&err&&status!==undefined,'usage: node scripts/creator-live-isolation-output-check.cjs stdout-file stderr-file exit-code');
    const result=checkOutput({stdout:fs.readFileSync(out,'utf8'),stderr:fs.readFileSync(err,'utf8'),status:Number(status),spec:fs.readFileSync('supabase/tests/creator_live_correctness.spec','utf8')});console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({status:'FAIL',reason:error.message}));process.exitCode=1;}
}
