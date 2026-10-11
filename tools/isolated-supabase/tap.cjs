// TAP accounting only; importing this module never starts a process.
const assert=require('node:assert/strict');
function parseTap(stdout,stderr='',exitCode=0) {
 assert.equal(exitCode,0,'SQL process failed');
 assert.ok(!/^(?:psql:[^\n]*:\s*)?(?:ERROR|FATAL|PANIC):/m.test(stderr+'\n'+stdout),'SQL error');
 assert.ok(!/^\s*Bail out!/mi.test(stdout),'TAP bailout');
 const plans=[],rows=[];
 for(const line of stdout.split(/\r?\n/)) {
  const p=line.match(/^\s*1\.\.(\d+)(?:\s*#\s*(.*))?\s*$/i); if(p) {plans.push(p);continue;}
  const r=line.match(/^\s*(not ok|ok)\s+(\d+)(?:\s+(.*))?$/i);
  if(r) rows.push({ok:r[1].toLowerCase()==='ok',number:Number(r[2]),skip:/#\s*skip\b/i.test(r[3]||''),todo:/#\s*todo\b/i.test(r[3]||'')});
 }
 assert.equal(plans.length,1,'Exactly one TAP plan required');
 const planned=Number(plans[0][1]); assert.equal(rows.length,planned,'TAP plan mismatch');
 rows.forEach((r,i)=>assert.equal(r.number,i+1,'Nonsequential/duplicate TAP assertion'));
 if(planned===0) assert.match(plans[0][2]||'',/^skip\b/i,'Empty suite must explicitly skip');
 const result={planned,assertions:rows.length,passed:rows.filter(r=>r.ok&&!r.skip&&!r.todo).length,
  failed:rows.filter(r=>!r.ok&&!r.skip&&!r.todo).length,skipped:rows.filter(r=>r.skip).length,todo:rows.filter(r=>r.todo).length,
  unexpected_todo_pass:rows.filter(r=>r.ok&&r.todo).length,suite_skipped:planned===0};
 assert.equal(result.failed,0,'Failed TAP assertions'); assert.equal(result.unexpected_todo_pass,0,'Unexpected TODO pass');
 return result;
}
function observedTap(stdout) {
 const rows=[...stdout.matchAll(/^\s*(not ok|ok)\s+(\d+)([^\r\n]*)$/gmi)];
 return {emitted_assertions:rows.length,not_ok:rows.filter(r=>r[1].toLowerCase()==='not ok').length,
  skip_directives:rows.filter(r=>/#\s*skip\b/i.test(r[3])).length,todo_directives:rows.filter(r=>/#\s*todo\b/i.test(r[3])).length};
}
module.exports={parseTap,observedTap};
