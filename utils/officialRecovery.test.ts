import assert from 'node:assert/strict';
import { it } from 'node:test';
import { compareOfficial, drainOfficialGap, preciseTime } from './officialRecovery.ts';
import { mergeMessagesById } from './liveRoomThread.ts';
const time='2026-10-09T01:00:00.123456+00:00';
const row=(n:number)=>({id:String(n).padStart(4,'0'),preciseCreatedAt:time,createdAt:Date.parse(time),parentMessageId:null,kind:'text',reactions:[]});
it('orders microseconds before ID ties and normalizes timezone offsets',()=>{
 assert.equal(preciseTime('2026-10-09T06:30:00.123456+05:30'),'2026-10-09T01:00:00.123456Z');
 assert.ok(compareOfficial({...row(2),preciseCreatedAt:time.replace('123456','123455')},row(1))<0);
});
for(const count of [41,81,125])it(`drains ${count} equal-timestamp rows across bounded pages without loss`,async()=>{
 const all=Array.from({length:count},(_,i)=>row(i+1));let calls=0, merged:typeof all=[];
 await drainOfficialGap(row(0),async cursor=>{calls++;return all.filter(r=>r.id>cursor.id).slice(0,40);},rows=>{merged=mergeMessagesById(merged,[...rows,...rows]);},()=>true);
 assert.equal(merged.length,count);assert.ok(calls<=5);assert.equal(merged[0].id,row(count).id);
});
it('a large gap resumes after the five-page budget rather than skipping unseen rows',async()=>{
 const all=Array.from({length:260},(_,i)=>row(i+1));let cursor=row(0),ids=new Set<string>(),calls=0;
 const fetch=async(c:typeof cursor)=>{calls++;return all.filter(r=>r.id>c.id).slice(0,40);};
 const accept=(rows:typeof all,next:typeof cursor)=>{rows.forEach(r=>ids.add(r.id));cursor=next;};
 await drainOfficialGap(cursor,fetch,accept,()=>true);assert.equal(ids.size,200);assert.equal(calls,5);
 await drainOfficialGap(cursor,fetch,accept,()=>true);assert.equal(ids.size,260);
});
it('account change during a page request discards the page and cursor',async()=>{
 let alive=true,accepted=0;
 await drainOfficialGap(row(0),async()=>{alive=false;return [row(1)];},()=>accepted++,()=>alive);
 assert.equal(accepted,0);
});
it('revoked access stops recovery and propagates authorization refusal',async()=>{
 let calls=0;
 await assert.rejects(drainOfficialGap(row(0),async()=>{calls++;throw Object.assign(new Error('denied'),{code:'42501'});},()=>assert.fail(),()=>true),{code:'42501'});
 assert.equal(calls,1);
});
it('repeated websocket hints deduplicate without changing fetched recovery progress',()=>{
 let rows=[row(1)];const cursor=rows[0];rows=mergeMessagesById(rows,[row(3),row(3)]);
 assert.equal(rows.length,2);assert.equal(cursor.id,'0001');
});
