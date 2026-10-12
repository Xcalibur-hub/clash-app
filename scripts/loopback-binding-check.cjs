// File-only binding checks. No Docker, Supabase, subprocess or network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const expected = { db: { target: 5432, published: '57722' }, kong: { target: 8000, published: '57721' } };
function checkCompose(config, project) {
  assert.match(project, /^clash_p11bind_[a-z0-9_]+$/);
  assert.equal(config.name, project);
  assert.ok(config.services?.db && config.services?.kong, 'Both required services must exist');
  for (const [name, service] of Object.entries(config.services)) {
    assert.ok(!service.network_mode, 'No network_mode overrides');
    const ports = service.ports ?? [];
    if (!expected[name]) { assert.deepEqual(ports, [], 'Unexpected published service'); continue; }
    assert.equal(ports.length, 1, 'Exactly one binding per published service');
    const p = ports[0]; const e = expected[name];
    assert.equal(p.host_ip, '127.0.0.1', 'Explicit loopback required');
    assert.equal(p.protocol, 'tcp'); assert.equal(p.target, e.target); assert.equal(p.published, e.published);
    assert.ok(!p.mode || p.mode === 'ingress');
  }
  return { status: 'STATIC_BINDING_POLICY_PASS', reachability_verified: false };
}
function checkInspect(containers, project, running) {
  assert.match(project, /^clash_p11bind_[a-z0-9_]+$/);
  const seen = new Set();
  for (const c of containers) {
    const labels = c.Config?.Labels;
    assert.equal(labels?.['com.docker.compose.project'], project);
    const name = labels['com.docker.compose.service'];
    assert.ok(name && !seen.has(name), 'Missing or duplicate service'); seen.add(name);
    assert.ok(c.HostConfig && c.HostConfig.NetworkMode !== 'host' && !c.HostConfig.NetworkMode?.startsWith('container:'));
    assert.equal(c.HostConfig.PublishAllPorts, false);
    const e = expected[name];
    const want = e ? { [e.target + '/tcp']: [{ HostIp: '127.0.0.1', HostPort: e.published }] } : {};
    assert.deepEqual(c.HostConfig.PortBindings ?? {}, want, 'Creation bindings do not match policy');
    if (running) {
      assert.equal(c.State?.Running, true, 'Running inspection required');
      assert.ok(c.NetworkSettings?.Ports, 'Missing actual bindings');
      const actual = Object.fromEntries(Object.entries(c.NetworkSettings.Ports).filter(([,v]) => v !== null));
      assert.deepEqual(actual, want, 'Actual bindings do not match policy');
    }
  }
  assert.ok(seen.has('db') && seen.has('kong'));
  return { status: running ? 'ACTUAL_BINDING_INSPECTION_PASS' : 'CREATION_BINDING_INSPECTION_PASS', reachability_verified: false };
}
if (require.main === module) {
  try {
    const [mode, file, project] = process.argv.slice(2);
    assert.equal(process.argv.length, 5, 'Usage: node scripts/loopback-binding-check.cjs compose|created|running FILE PROJECT');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(['compose','created','running'].includes(mode));
    console.log(JSON.stringify(mode === 'compose' ? checkCompose(value, project) : checkInspect(value, project, mode === 'running')));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkCompose, checkInspect };
