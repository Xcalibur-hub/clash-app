import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { validQuestionChoices,questionChoices,parseQuestionState,questionPercent } from './arenaQuestions.ts';
const state={takeId:'q',sideA:'Yes',sideB:'No',status:'open',expiresAt:'2026-10-10T00:00:00.123456Z',countA:0,countB:0,total:0,mySide:null,revision:0};
describe('casual question contracts',()=>{
 it('requires distinct bounded meaningful labels',()=>{
  assert.ok(validQuestionChoices(' Yes ','No'));assert.ok(validQuestionChoices('हाँ','नहीं'));
  for(const [a,b] of [['yes',' YES '],['','No'],['!','?'],['a'.repeat(61),'b']])assert.equal(validQuestionChoices(a,b),false);
 });
 it('preserves ordinary Takes and parses explicit human/editorial provenance',()=>{
  assert.equal(questionChoices({text:'ordinary'}),undefined);
  const row={question_a:'Yes',question_b:'No',question_origin:'human'};
  assert.equal(questionChoices(row)?.origin,'human');
  assert.equal(questionChoices({...row,question_origin:'editorial',question_source_url:'https://example.org/source'})?.sourceUrl,'https://example.org/source');
  assert.throws(()=>questionChoices({...row,question_origin:'unknown'}));
 });
 it('retains timestamp precision and honest empty totals',()=>{
  assert.equal(parseQuestionState(state,'q').expiresAt,state.expiresAt);
  assert.equal(questionPercent(0,0),null);assert.equal(questionPercent(1,2),'50%');
 });
 it('accepts selected sides, genuine ties and closed history',()=>{
  const tie={...state,mySide:'B',revision:2,countA:1,countB:1,total:2,status:'closed'};
  assert.equal(parseQuestionState(tie,'q').mySide,'B');
 });
 it('rejects malformed and cross-question state',()=>{
  for(const patch of [{takeId:'other'},{countA:-1},{total:1},{mySide:'DRAW'},{mySide:'A',revision:0},{revision:1},{expiresAt:'invalid'},{status:'live'},{countA:0.5,countB:0.5,total:1}])assert.throws(()=>parseQuestionState({...state,...patch},'q'));
 });
});
