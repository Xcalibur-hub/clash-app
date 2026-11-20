'use strict';
const { evalInHermes } = require('./lib/arena-hermes-cdp.cjs');

async function main() {
  const storage = await evalInHermes(`() => {
    let target = null;
    for (const [id, m] of globalThis.__r.getModules().entries()) {
      const name = m && m.verboseName ? m.verboseName.replaceAll('\\\\', '/') : '';
      if (name.includes('@react-native-async-storage/async-storage/') && (name.endsWith('/index.ts') || name.endsWith('/index.js') || name.endsWith('/AsyncStorage.js'))) {
        const exp = globalThis.__r(id);
        if (exp && exp.default && typeof exp.default.getAllKeys === 'function') { target = exp.default; break; }
      }
    }
    if (!target) throw new Error('AsyncStorage unavailable');
    return target.getAllKeys().then((keys) =>
      Promise.all(keys.map((k) => target.getItem(k).then((v) => ({ k, length: v ? v.length : 0 }))))
    );
  }`, { timeoutMs: 15000 });
  console.log('Storage keys:', JSON.stringify(storage, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { main };
