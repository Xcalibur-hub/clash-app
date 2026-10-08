// Local-only adversarial PostgREST checks. Never print credentials or profile data.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const status = JSON.parse(execFileSync('supabase.exe', ['status', '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname));
const make = key => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = make(status.SERVICE_ROLE_KEY);
const guest = make(status.ANON_KEY);
const must = result => { assert.equal(result.error, null, result.error?.code); return result.data; };
async function main() {
  const users = []; const clients = []; const credentialsByUser = []; const profiles = [];
  try {
    must(await guest.from('profiles').select('id,handle,name,avatar_tint,bio,home_hood,reputation,rank,streak').limit(1));
    for (const field of ['*', 'auth_user_id', 'coins', 'role', 'moderated_hoods']) {
      assert.ok((await guest.from('profiles').select(field).limit(1)).error, `guest denied ${field}`);
    }
    assert.ok((await guest.rpc('get_my_profile')).error);
    for (let i = 0; i < 2; i++) {
      const credentials = { email: `security-${randomUUID()}@example.test`, password: randomUUID() };
      credentialsByUser.push(credentials);
      const user = must(await admin.auth.admin.createUser({ ...credentials, email_confirm: true })).user;
      users.push(user.id);
      const profile = must(await admin.from('profiles').select('id').eq('auth_user_id', user.id).single());
      profiles.push(profile.id);
      must(await admin.from('profiles').update({ coins: 137 + i }).eq('id', profile.id));
      const client = make(status.ANON_KEY); clients.push(client);
      must(await client.auth.signInWithPassword(credentials));
      const mine = must(await client.rpc('get_my_profile'));
      assert.equal(mine.length, 1); assert.equal(mine[0].id, profile.id); assert.equal(mine[0].coins, 137 + i);
      assert.equal(mine[0].auth_user_id, undefined); assert.equal(mine[0].role, undefined);
      assert.ok((await client.from('profiles').select('id').eq('auth_user_id', users[0])).error);
      assert.ok((await client.from('profiles').update({ role: 'admin' }).eq('id', profile.id)).error);
      assert.ok((await client.from('profiles').update({ coins: 999 }).eq('id', profile.id)).error);
      must(await client.from('profiles').update({ bio: 'Local security test' }).eq('id', profile.id));
    }
    for (const client of [guest,clients[0]]) {
      assert.equal((await client.rpc('arena_actor_hidden',{p_viewer:profiles[1],p_author:profiles[0]})).error?.code,'42501');
      assert.equal((await client.rpc('explore_actor_hidden',{p_viewer:profiles[1],p_author:profiles[0]})).error?.code,'42501');
      assert.equal((await client.rpc('vault_profiles_blocked',{p_a:profiles[1],p_b:'unrelated-profile'})).error?.code,'42501');
      assert.equal((await client.rpc('can_access_vault_drop',{p_viewer_profile_id:profiles[1],p_drop_id:'unavailable'})).error?.code,'42501');
    }
    assert.ok((await guest.rpc('get_arena_crew',{p_slug:'unavailable'})).error);
    await clients[0].auth.signOut(); must(await clients[0].auth.signInWithPassword(credentialsByUser[1]));
    const switched=must(await clients[0].rpc('get_my_profile'));
    assert.equal(switched[0].id,profiles[1]); assert.equal(switched[0].coins,138);
    console.log('PASS anonymous profile projection, internal-field denial, authenticated isolation and escalation checks over PostgREST');
    console.log('PASS direct relationship/entitlement RPC probing denied and same-client account switching isolates own profile');
  } finally {
    for (const client of clients) { await client.removeAllChannels(); await client.auth.signOut(); }
    for (const id of users) {
      must(await admin.from('profiles').delete().eq('auth_user_id', id));
      must(await admin.auth.admin.deleteUser(id));
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
