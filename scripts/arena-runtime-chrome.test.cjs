const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, React } = require('./ui-completion-harness.cjs');
const find = (tree, name) => nodes(tree).find(n => (n.type?.name ?? n.type) === name);
const room = { roomId: 'retained-room', phase: 'judging', topic: { title: 'Test proposition' },
  duel: { clashId: 'clash', status: 'open', viewerRelationship: 'fighter_a',
    fighterA: { id: 'a', name: 'Fighter A' }, fighterB: { id: 'b', name: 'Fighter B' } } };

test('developer diagnostics expand locally in normal flow with a 44dp action', async () => {
  const prior = global.__DEV__; global.__DEV__ = true;
  const h = harness('components/liveArena/DuelDevPanel.tsx', { room });
  try {
    await h.mount();
    assert.notEqual(h.tree.props.style.position, 'absolute');
    assert.equal(h.tree.props.style.bottom, undefined);
    const toggle = h.nodes.find(n => n.props?.accessibilityLabel === 'Toggle Clash debug panel');
    assert.equal(toggle.props.accessibilityRole, 'button');
    assert.ok(toggle.props.style[0].minHeight >= 44);
    assert.ok(toggle.props.style[0].minWidth >= 44);
    assert.equal(toggle.props.accessibilityState.expanded, false);
    assert.equal(find(h.tree, 'Text').props.children, 'DEV');
    await h.act(async () => toggle.props.onPress());
    assert.equal(h.nodes.find(n => n.props?.accessibilityLabel === 'Toggle Clash debug panel').props.accessibilityState.expanded, true);
    assert.ok(h.nodes.some(n => Array.isArray(n.props?.children) && n.props.children.includes('judging')));
    await h.act(async () => toggle.props.onPress());
    assert.equal(h.nodes.filter(n => n.type === 'Text').length, 1);
  } finally { await h.unmount(); global.__DEV__ = prior; }
});

test('release builds still render no developer diagnostics', async () => {
  const prior = global.__DEV__; global.__DEV__ = false;
  const h = harness('components/liveArena/DuelDevPanel.tsx', { room });
  try { await h.mount(); assert.equal(h.tree, null); }
  finally { await h.unmount(); global.__DEV__ = prior; }
});

test('overflow sheet contains diagnostics before Close and preserves close handling', async () => {
  const prior = global.__DEV__; global.__DEV__ = true;
  let closed = 0;
  const diagnostics = React.createElement('DiagnosticsFixture');
  const h = harness('components/liveArena/ClashMoreSheet.tsx', { visible: true, onClose: () => closed++, children: diagnostics });
  try {
    await h.mount();
    assert.equal(h.tree.props.visible, true);
    const backdrop = h.nodes.find(n => n.props?.accessibilityLabel === 'Dismiss');
    assert.equal(backdrop.props.style[1].paddingBottom, 40, 'sheet must clear the supplied navigation inset plus breathing room');
    const sheet = nodes(h.tree).find(n => Array.isArray(n.props?.children) && n.props.children.includes(diagnostics));
    assert.ok(sheet);
    const close = h.nodes.find(n => n.props?.accessibilityLabel === 'Close');
    await h.act(async () => close.props.onPress()); assert.equal(closed, 1);
    await h.update({ visible: false, onClose: () => closed++, children: diagnostics });
    assert.equal(h.tree.props.visible, false, 'native Modal hides all diagnostic content');
  } finally { await h.unmount(); global.__DEV__ = prior; }
});

test('release overflow retains its existing spacing', async () => {
  const prior = global.__DEV__; global.__DEV__ = false;
  const h = harness('components/liveArena/ClashMoreSheet.tsx', { visible: true, onClose() {} });
  try {
    await h.mount();
    const backdrop = h.nodes.find(n => n.props?.accessibilityLabel === 'Dismiss');
    assert.equal(backdrop.props.style[1].paddingBottom, 32);
  } finally { await h.unmount(); global.__DEV__ = prior; }
});

test('actual Room places its sole diagnostics instance inside the overflow sheet', async () => {
  const leafNames = ['ArenaAtmosphere', 'ArgumentHistorySheet', 'DuelEntrance', 'DuelRoomOutcome', 'ImmersiveClash', 'PrivateAssistPanel', 'ArenaSheet', 'ArenaButton', 'PressableScale'];
  const dependencies = Object.fromEntries(leafNames.map(name => [name === 'ArenaButton' ? 'ArenaPrimitives' : name, { [name]: name }]));
  dependencies.useArenaCrowd = { useArenaCrowd: () => ({ identityVersion: 1 }) };
  dependencies.useDuelReactionBurst = { useDuelReactionBurst: () => null };
  // The mounted harness supplies native primitives; this screen also owns IME listeners.
  const rn = { View: 'View', Text: 'Text', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView',
    Platform: { OS: 'android' }, Keyboard: { addListener: () => ({ remove() {} }) }, Share: {},
    useWindowDimensions: () => ({ fontScale: 1 }), StyleSheet: { create: x => x, hairlineWidth: 1 } };
  dependencies['react-native'] = rn;
  const h = harness('components/liveArena/DuelRoomExperience.tsx', { room, messages: [], threadLocked: false }, undefined, { dependencies });
  h.services.fetchClashFollowState = async () => false;
  try {
    await h.mount();
    const sheet = find(h.tree, 'ClashMoreSheet'); assert.ok(sheet);
    assert.equal(sheet.props.visible, false);
    const dev = find(sheet, 'DuelDevPanel'); assert.ok(dev);
    assert.equal(nodes(h.tree).filter(n => n.type?.name === 'DuelDevPanel').length, 1);
    const immersive = find(h.tree, 'ImmersiveClash');
    await h.act(async () => immersive.props.onMore());
    assert.equal(find(h.tree, 'ClashMoreSheet').props.visible, true);
  } finally { await h.unmount(); }
});
