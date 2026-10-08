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
  const users = []; const clients = [];
  try {
    must(await guest.from('profiles').select('id,handle,name,avatar_tint,bio,home_hood,reputation,rank,streak').limit(1));
    for (const field of ['*', 'auth_user_id', 'coins', 'role', 'moderated_hoods']) {
      assert.ok((await guest.from('profiles').select(field).limit(1)).error, `guest denied ${field}`);
    }
    assert.ok((await guest.rpc('get_my_profile')).error);
    for (let i = 0; i < 2; i++) {
      const credentials = { email: `security-${randomUUID()}@example.test`, password: randomUUID() };
      const user = must(await admin.auth.admin.createUser({ ...credentials, email_confirm: true })).user;
      users.push(user.id);
      const profile = must(await admin.from('profiles').select('id').eq('auth_user_id', user.id).single());
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
    console.log('PASS anonymous profile projection, internal-field denial, authenticated isolation and escalation checks over PostgREST');
  } finally {
    for (const client of clients) { await client.removeAllChannels(); await client.auth.signOut(); }
    for (const id of users) {
      must(await admin.from('profiles').delete().eq('auth_user_id', id));
      must(await admin.auth.admin.deleteUser(id));
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
