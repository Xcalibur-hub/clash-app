import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { mergeCrowd,parseCrowdContext,parseCrowdMessage,parseCrowdPage,reconcileCrowd,validCrowdText } from './arenaCrowd.ts';
const row=(n:number,time='2026-10-08T10:00:00.123456+00:00') => ({ id:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,roomId:'r',body:'Hello',createdAt:time,isOwn:false,author:{id:'s',name:'Spectator',handle:'spectator',avatarTint:'#aaaaaa'} });
describe('public Crowd contracts',() => {
  it('accepts genuine rows and retains cursor precision',() => assert.equal(parseCrowdMessage(row(1),'r').createdAt,row(1).createdAt));
  it('rejects rows from a different Room',() => assert.throws(() => parseCrowdMessage(row(1),'private')));
  it('rejects absent authors and malformed timestamps',() => { assert.throws(() => parseCrowdMessage({...row(1),author:null},'r')); assert.throws(() => parseCrowdMessage({...row(1),createdAt:'no'},'r')); });
  it('rejects malformed pages and oversized pages',() => { assert.throws(() => parseCrowdPage({},'r')); assert.throws(() => parseCrowdPage(Array(101).fill(row(1)),'r')); });
  it('accepts zero real spectators without inventing them',() => assert.equal(parseCrowdContext({roomId:'r',canSend:true,spectatorCount:0,serverNow:row(1).createdAt,closesAt:row(1).createdAt},'r').spectatorCount,0));
  it('rejects fake fractional and negative counts',() => { for(const count of [-1,1.5,'10']) assert.throws(() => parseCrowdContext({roomId:'r',canSend:true,spectatorCount:count,serverNow:row(1).createdAt,closesAt:row(1).createdAt},'r')); });
  it('bounds text and rejects whitespace/invisible-only bodies',() => { for(const text of ['',' \n\t','\u00a0','\u200b\u200d','x'.repeat(501)]) assert.equal(validCrowdText(text),false); assert.equal(validCrowdText('A useful point 🔥'),true); });
  it('deduplicates server acknowledgements and Realtime hydration',() => assert.equal(mergeCrowd([row(1)],[row(1)]).length,1));
  it('orders same-millisecond messages at database precision',() => assert.deepEqual(mergeCrowd([row(2,'2026-10-08T10:00:00.123457+00:00')],[row(1)]).map(r=>r.id),[row(1).id,row(2).id]));
  it('keeps deterministic ID ties and bounds the live window',() => assert.deepEqual(mergeCrowd([row(3),row(1)],[row(2)],2).map(r=>r.id),[row(2).id,row(3).id]));
  it('evicts checked moderated/blocked rows but retains unchecked history',() => assert.deepEqual(reconcileCrowd([row(1),row(2)],[row(1).id],[]).map(r=>r.id),[row(2).id]));
  it('updates permitted rows during reconciliation',() => assert.equal(reconcileCrowd([row(1)],[row(1).id],[{...row(1),body:'Visible'}])[0].body,'Visible'));
});
