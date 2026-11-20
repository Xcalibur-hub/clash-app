const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./ui-completion-harness.cjs');
function setup(onOpenAuthor) {
  return harness('components/arena/TakeEditorialHeader.tsx', {
    take: { hood: 'techtakes', text: 'A supported discussion', createdAt: Date.now(), expiresAt: Date.now() + 100000 },
    author: { id: 'real-profile-id', name: 'QA Rowan', handle: 'qa-rowan' }, archived: false, isViewer: true, onOpenAuthor,
  }, undefined, { dependencies: {
    arena: { arena: { type: new Proxy({}, { get: () => ({}) }) }, arenaColors: () => ({}) },
    ArenaPrimitives: { ArenaBadge: 'ArenaBadge', ArenaIdentity: 'ArenaIdentity' },
    TakeDetailHero: { TakeDetailHero: 'TakeDetailHero' },
  } });
}
test('actual header exposes a labeled 44dp author action and invokes the supplied navigation callback', async () => {
  let pressed = 0; const h = setup(() => pressed++);
  try {
    await h.mount(); const action = h.nodes.find(n => n.props?.accessibilityLabel === "Open QA Rowan's profile");
    assert.ok(action); assert.equal(action.props.accessibilityRole, 'button'); assert.equal(action.props.style.minHeight, 44);
    await h.act(async () => action.props.onPress()); assert.equal(pressed, 1);
  } finally { await h.unmount(); }
});
test('static visual preview without navigation has no dead author button', async () => {
  const h = setup(); try { await h.mount(); assert.equal(h.nodes.some(n => n.props?.accessibilityRole === 'button'), false); }
  finally { await h.unmount(); }
});
