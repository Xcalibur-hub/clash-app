import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClashSettlement } from './clashSettlement.ts';
const cancelled = { clash_id:'cl', status:'cancelled', jury_size:0 };
const settled = { clash_id:'cl',winner_side:'A',side_a_score:1,side_b_score:0,jury_size:1,agreement:1,margin:1,verdict_label:'SPLIT DECISION' };
test('zero-ballot cancellation and retries succeed without a manufactured verdict',()=>{
  const expected={status:'cancelled',clashId:'cl',jurySize:0,verdict:null};
  assert.deepEqual(parseClashSettlement(cancelled,'cl'),expected);
  assert.deepEqual(parseClashSettlement({...cancelled},'cl'),expected);
});
test('settled response and retries preserve legacy flat fields and explicit verdict',()=>{
  const result=parseClashSettlement(settled,'cl');
  assert.equal(result?.status,'settled');
  if(result?.status==='settled') {assert.equal(result.winnerSide,'A');assert.equal(result.verdict.winnerSide,'A');}
  assert.deepEqual(parseClashSettlement({...settled},'cl'),result);
});
test('DRAW remains a genuine settled verdict',()=>{
  const result=parseClashSettlement({...settled,winner_side:'DRAW',side_b_score:1,jury_size:2,agreement:0.5,margin:0,verdict_label:'DRAW'},'cl');
  assert.equal(result?.status,'settled');
  assert.equal(result?.verdict?.winnerSide,'DRAW');
});
test('settlement parser rejects malformed, foreign and contradictory terminal data',()=>{
  for(const invalid of [null,[],{},'cancelled',{...cancelled,clash_id:'private'}, {...cancelled,jury_size:1},
    {...cancelled,winner_side:'A'}, {...cancelled,verdict:settled}, {...settled,status:'open'},
    {...settled,clash_id:'private'}, {...settled,jury_size:0}, {...settled,side_a_score:NaN},
    {...settled,agreement:Infinity}, {...settled,margin:-1}, {...settled,verdict_label:''},
    {...settled,winner_side:'B'}, {...settled,jury_size:2}]) assert.equal(parseClashSettlement(invalid,'cl'),null);
});
