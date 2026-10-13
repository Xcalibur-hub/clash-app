/**
 * Local staging functional smoke (Phase 11 Step 9, Part B).
 *
 * DISPOSABLE LOCAL ONLY. Refuses any non-loopback Supabase URL so it can never
 * touch hosted staging or production.
 *
 * Exercises: sign-up, sign-in, session refresh, profile creation via PostgREST,
 * an authenticated RPC, Storage upload/read plus cross-namespace denial, and a
 * Realtime subscribe round-trip.
 *
 * Usage: node scripts/local-staging-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SMOKE_SUPABASE_URL ?? 'http://127.0.0.1:57751';
const anon = process.env.SMOKE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const service = process.env.SMOKE_SERVICE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const parsed = new URL(url);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
  console.error(`refusing non-loopback target: ${parsed.hostname}`);
  process.exit(1);
}

const results = [];
const rec = (name, ok, detail = '') => results.push({ name, result: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 160) });
const stamp = Date.now();
const email = `smoke-${stamp}@example.com`;
const password = `smoke-local-pass-${stamp}`;
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

try {
  const signUp = await client.auth.signUp({ email, password });
  rec('auth.sign_up', !signUp.error && !!signUp.data?.user, signUp.error?.message ?? signUp.data?.user?.id);

  let session = signUp.data?.session ?? null;
  if (!session) {
    const signIn = await client.auth.signInWithPassword({ email, password });
    rec('auth.sign_in', !signIn.error && !!signIn.data?.session, signIn.error?.message ?? 'session issued');
    session = signIn.data?.session ?? null;
  } else {
    rec('auth.sign_in', true, 'session issued by sign-up (confirmations disabled)');
  }
  if (!session) throw new Error('no session after sign-up/sign-in');
  const authed = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await authed.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

  const refresh = await authed.auth.refreshSession({ refresh_token: session.refresh_token });
  rec('auth.session_refresh', !refresh.error && !!refresh.data?.session, refresh.error?.message ?? 'refreshed');

  const uid = session.user.id;
  // profiles has table SELECT revoked; direct reads must be denied and the
  // reviewed RPC is the supported path (migration 20261008110000).
  const direct = await authed.from('profiles').select('id').eq('auth_user_id', uid);
  rec('postgrest.profile_direct_select_denied', !!direct.error, direct.error ? 'denied' : 'ALLOWED (unexpected)');
  const myProfile = await authed.rpc('get_my_profile');
  const profileRow = Array.isArray(myProfile.data) ? myProfile.data[0] : myProfile.data;
  rec('postgrest.profile_rpc', !myProfile.error && !!profileRow?.id, myProfile.error?.message ?? `profile=${profileRow?.id}`);
  const profileId = (await authed.rpc('my_profile_id')).data;
  rec('postgrest.my_profile_id', typeof profileId === 'string' && profileId.length > 0, profileId ?? 'missing');

  const anonRead = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const topics = await anonRead.from('arena_daily_topics').select('id').limit(1);
  rec('postgrest.anon_read', !topics.error, topics.error?.message ?? `rows=${topics.data?.length}`);

  const rpc = await authed.rpc('get_my_arena_interests');
  rec('postgrest.authenticated_rpc', !rpc.error && rpc.data != null, rpc.error?.message ?? JSON.stringify(rpc.data).slice(0, 60));

  // storage.objects insert policy requires the name to start with the caller's
  // PROFILE id (`name like public.my_profile_id() || '/%'`).
  const path = `${profileId ?? uid}/smoke-${stamp}.png`;
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const upload = await authed.storage.from('public-media').upload(path, new Blob([png], { type: 'image/png' }), { contentType: 'image/png' });
  rec('storage.own_namespace_upload', !upload.error, upload.error?.message ?? path);
  if (!upload.error) {
    const download = await authed.storage.from('public-media').download(path);
    rec('storage.authenticated_read', !download.error, download.error?.message ?? `${download.data?.size ?? 0} bytes`);
  }
  const badMime = await authed.storage.from('public-media').upload(`${profileId ?? uid}/smoke-${stamp}.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' });
  rec('storage.disallowed_mime_denied', !!badMime.error, badMime.error ? 'denied' : 'ALLOWED (unexpected)');
  const foreign = await authed.storage.from('public-media').upload(`u_00000000000000000000000000000000/smoke.png`, new Blob([png], { type: 'image/png' }), { contentType: 'image/png' });
  rec('storage.cross_namespace_upload_denied', !!foreign.error, foreign.error ? 'denied' : 'ALLOWED (unexpected)');
  if (!upload.error) await authed.storage.from('public-media').remove([path]);

  const rt = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: 'timeout' }), 15000);
    const channel = authed.channel(`smoke-${stamp}`).on('postgres_changes', { event: '*', schema: 'public', table: 'arena_crowd_messages' }, () => {}).subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        authed.removeChannel(channel);
        resolve({ status });
      }
    });
  });
  rec('realtime.subscribe', rt.status === 'SUBSCRIBED', rt.status);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const cleanup = await admin.auth.admin.deleteUser(uid);
  rec('smoke_cleanup', !cleanup.error, cleanup.error?.message ?? 'disposable user removed');
} catch (e) {
  rec('smoke_run', false, e?.message ?? e);
}

const failed = results.filter((r) => r.result !== 'PASS');
console.log(JSON.stringify({ target: url, results, passed: results.length - failed.length, failed: failed.length }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
