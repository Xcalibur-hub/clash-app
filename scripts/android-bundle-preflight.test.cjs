const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./android-bundle-preflight.cjs');
const button = label => `<node package="com.clash.v2.dev" content-desc="${label}" clickable="true" enabled="true" bounds="[1,1][10,10]"/>`;
const good = { connected: true, reachable: true, since: 10,
  events: [{ event: 'bundle_served', android: true, started: 11, at: 20, status: 200 }],
  log: 'ReactNativeJS: Running "main"', screen: 'profile',
  xml: button('More profile actions') + button('Edit profile') };
test('actual fresh Android bundle, execution and usable UI pass together', () => assert.equal(evaluate(good).pass, true));
for (const [name, patch] of [
  ['disconnected device', { connected: false }],
  ['unreachable Metro', { reachable: false }],
  ['status alone', { events: [] }],
  ['bundle still compiling', { events: [{ event: 'bundle_requested', android: true, started: 11 }] }],
  ['stale bundle', { events: [{ ...good.events[0], started: 9 }] }],
  ['non-Android probe', { events: [{ ...good.events[0], android: false }] }],
  ['bundle build failure', { events: [{ ...good.events[0], status: 500 }] }],
  ['JS not executed', { log: '' }],
  ['blank tree', { xml: '<hierarchy/>' }],
  ['reload overlay', { xml: good.xml + 'Reloading…' }],
  ['splash only', { xml: '<node package="com.clash.v2.dev" text="CLASH"/>' }],
  ['profile cannot stand in for Arena', { screen: 'arena' }],
]) test(name + ' fails closed', () => assert.equal(evaluate({ ...good, ...patch }).pass, false));

test('Metro preload records real request completion without URLs, headers or bodies', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const { EventEmitter } = require('node:events');
  class Server extends EventEmitter {}
  const records = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('./android-bundle-trace.cjs'), 'utf8'), {
    process: { env: { CLASH_ANDROID_BUNDLE_TRACE: require('node:path').resolve('private-test-trace') } },
    require: name => name === 'node:http' ? { Server } : name === 'node:fs' ? {
      appendFileSync: (_file, line) => records.push(JSON.parse(line)),
    } : require(name), URL, Date,
  });
  const server = new Server();
  const response = new EventEmitter();
  response.statusCode = 200;
  server.emit('request', { url: '/entry.bundle?token=never-record-this',
    headers: { authorization: 'never-record-this', 'user-agent': 'okhttp' } }, response);
  assert.equal(records.length, 1);
  assert.equal(records[0].event, 'bundle_requested');
  response.emit('finish');
  assert.equal(records.length, 2);
  assert.equal(records[1].status, 200);
  assert.equal(records[1].android, true);
  assert.ok(!JSON.stringify(records).includes('never-record-this'));
  server.emit('request', { url: '/status', headers: {} }, new EventEmitter());
  assert.equal(records.length, 2);
});
