'use strict';
const live = require('../.expo/realtime-execution-bridge/live-io.cjs');
const ro = live.readIO();
const clashId = 'cl_568c4376cb40e365';
const roomId = 'ar_222ea1d858d8e5fa';

console.log('--- CLASH ---');
console.log(ro.sql("SELECT to_jsonb(c) FROM public.clashes c WHERE id='" + clashId + "'"));

console.log('--- ROOM ---');
console.log(ro.sql("SELECT to_jsonb(r) FROM public.arena_rooms r WHERE id='" + roomId + "'"));

console.log('--- TOPIC DEADLINES ---');
console.log(ro.sql("SELECT json_build_object('opens_at', opens_at, 'final_arguments_at', final_arguments_at, 'judging_at', judging_at, 'closes_at', closes_at) FROM public.arena_daily_topics WHERE id='at_0cd354c6aa822e6c'"));

console.log('--- PARTICIPANTS ---');
console.log(ro.sql("SELECT coalesce(json_agg(p ORDER BY profile_id), '[]'::json) FROM public.arena_room_participants p WHERE room_id='" + roomId + "'"));

console.log('--- MESSAGES ---');
console.log(ro.sql("SELECT coalesce(json_agg(m ORDER BY id), '[]'::json) FROM public.arena_room_messages m WHERE room_id='" + roomId + "'"));

console.log('--- JUDGEMENTS ---');
console.log(ro.sql("SELECT coalesce(json_agg(j ORDER BY juror_id), '[]'::json) FROM public.judgements j WHERE clash_id='" + clashId + "'"));

console.log('--- VERDICTS ---');
console.log(ro.sql("SELECT coalesce(json_agg(v ORDER BY clash_id), '[]'::json) FROM public.verdicts v WHERE clash_id='" + clashId + "'"));
