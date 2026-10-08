import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interestFeedPage, parseInterestCatalogue, parseInterestPreferences, prioritizeInterestTopics, toggleInterest, validInterestSelection } from './arenaInterests.ts';
describe('account interest contract', () => {
  it('requires three to five unique selections', () => {
    assert.equal(validInterestSelection(['a','b']),false); assert.equal(validInterestSelection(['a','a','b']),false);
    assert.equal(validInterestSelection(['a','b','c']),true); assert.equal(validInterestSelection(['a','b','c','d','e','f']),false);
  });
  it('allows deselection at the limit but blocks a sixth', () => {
    const ids=['a','b','c','d','e'];assert.deepEqual(toggleInterest(ids,'f'),ids);assert.deepEqual(toggleInterest(ids,'c'),['a','b','d','e']);
  });
  it('validates durable completion and explicit skip', () => {
    assert.equal(parseInterestPreferences({topicIds:[],version:1,revision:1,skipped:true}).skipped,true);
    assert.throws(()=>parseInterestPreferences({topicIds:[],version:1,revision:1,skipped:false}));
    assert.throws(()=>parseInterestPreferences({topicIds:['a','a','b'],version:1,revision:1,skipped:false}));
    assert.throws(()=>parseInterestPreferences({topicIds:[],version:1,revision:-1,skipped:true}));
  });
  it('rejects duplicate catalogue IDs and preserves server mappings', () => {
    const t={id:'tech',name:'Tech',description:'Products',hoods:['techtakes']};assert.deepEqual(parseInterestCatalogue([t])[0]?.hoods,['techtakes']);
    assert.throws(()=>parseInterestCatalogue([t,t]));
  });
  it('uses only supplied server mappings to prioritize live topics', () => {
    const topics=[{hood:'football'},{hood:'techtakes'},{hood:null}];const catalogue=parseInterestCatalogue([{id:'tech',name:'Tech',description:'Products',hoods:['techtakes']}]);
    const prefs={topicIds:['tech'],version:1,revision:1,skipped:false};assert.deepEqual(prioritizeInterestTopics(topics,catalogue,prefs),[topics[1],topics[0],topics[2]]);
    assert.deepEqual(prioritizeInterestTopics(topics,catalogue,{...prefs,topicIds:[],skipped:true}),topics);
  });
  it('pages an immutable bounded server ranking without duplicates', () => {
    const ids=Array.from({length:60},(_,i)=>String(i));const a=interestFeedPage(ids,0),b=interestFeedPage(ids,20),c=interestFeedPage(ids,40);
    assert.deepEqual([...a,...b,...c],ids);assert.deepEqual(interestFeedPage(ids,60),[]);
    assert.throws(()=>interestFeedPage(ids,-1));assert.throws(()=>interestFeedPage(ids,0,61));assert.throws(()=>interestFeedPage([...ids,'61'],0));
  });
});
