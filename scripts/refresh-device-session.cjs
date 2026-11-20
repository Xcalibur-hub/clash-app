'use strict';
const { evalInHermes } = require('./lib/arena-hermes-cdp.cjs');

async function main() {
  const result = await evalInHermes(`(getMod) => {
    const mod = getMod('services/supabaseClient.ts');
    const c = mod && mod.supabase;
    if (!c) throw new Error('Supabase client unavailable');
    return c.auth.refreshSession().then((res) => ({
      data: res.data ? {
        user: res.data.user ? { id: res.data.user.id, role: res.data.user.role } : null,
        session: res.data.session ? {
          expires_at: res.data.session.expires_at,
          expires_in: res.data.session.expires_in,
        } : null,
      } : null,
      error: res.error ? { message: res.error.message, status: res.error.status } : null,
    }));
  }`, { timeoutMs: 15000 });
  console.log('Refresh result:', JSON.stringify(result));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { main };
