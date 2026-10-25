const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, nodes, text } = require('./ui-completion-harness.cjs');
const find = (h, name) => h.nodes.find(n => n.type?.name === name || n.type === name);
const product = (extra = {}) => ({ id: 'fictional-product', title: 'Field notes', accessType: 'free', externalUrl: null, ...extra });
const nativeButton = h => {
  const n = find(h, 'VaultActionButton');
  return h.load('components/vault/VaultActionButton.tsx').VaultActionButton(n.props);
};

for (const accessType of ['free', 'paid', 'subscriber', 'contact']) {
  test(`Product ${accessType} without delivery is noninteractive status, not a no-op purchase`, async () => {
    const h = harness('components/vault/ProductAction.tsx', { product: product({ accessType }) });
    h.services.openURL = () => { throw Error('Must not open'); };
    try {
      await h.mount(); assert.equal(find(h, 'VaultActionButton'), undefined);
      assert.equal(h.nodes.some(n => n.props?.accessibilityRole === 'button'), false);
      assert.match(text(h.tree), /No delivery link/); assert.doesNotMatch(text(h.tree), /unlocked|purchased/i);
    } finally { await h.unmount(); }
  });
}

test('External product action is busy/duplicate-safe and supports failure retry', async () => {
  const h = harness('components/vault/ProductAction.tsx', { product: product({ externalUrl: 'https://example.invalid/fictional' }) });
  const gate = deferred(); let calls = 0;
  h.services.openURL = url => { assert.equal(url, 'https://example.invalid/fictional'); calls++; return calls === 1 ? gate.promise : Promise.resolve(); };
  try {
    await h.mount(); const original = find(h, 'VaultActionButton').props.onPress;
    await h.act(async () => { original(); original(); }); assert.equal(calls, 1);
    assert.equal(nativeButton(h).props.disabled, true); assert.equal(nativeButton(h).props.accessibilityState.busy, true);
    await h.act(async () => nativeButton(h).props.onPress()); assert.equal(calls, 1);
    await h.act(async () => gate.reject(Error('sensitive OS error')));
    assert.match(text(h.tree), /Couldn't open this link/); assert.doesNotMatch(text(h.tree), /sensitive/);
    assert.equal(nativeButton(h).props.disabled, false);
    await h.act(async () => nativeButton(h).props.onPress()); assert.equal(calls, 2);
    assert.doesNotMatch(text(h.tree), /Couldn't open/);
  } finally { await h.unmount(); }
});

for (const state of [{ disabled: true }, { busy: true }, { onPress: undefined }]) {
  test(`VaultActionButton rejects interaction for ${Object.keys(state)[0]} with accessible semantics`, async () => {
    let calls = 0; const h = harness('components/vault/VaultActionButton.tsx', { label: 'Action', onPress: () => calls++, ...state });
    try {
      await h.mount(); assert.equal(h.tree.props.disabled, true); assert.equal(h.tree.props.accessibilityState.disabled, true);
      await h.act(async () => h.tree.props.onPress()); assert.equal(calls, 0); assert.equal(h.events.includes('haptic'), false);
      const style = h.tree.props.style.filter(Boolean); assert.ok(style.some(s => s.minHeight >= 44));
    } finally { await h.unmount(); }
  });
}

test('Existing button callers work in both themes, preserve label scaling and press semantics', async () => {
  let calls = 0; const h = harness('components/vault/VaultActionButton.tsx', { label: 'Open', compact: true, onPress: () => calls++ });
  try {
    await h.mount(); assert.equal(h.tree.props.disabled, false); await h.act(async () => h.tree.props.onPress()); assert.equal(calls, 1);
    assert.notEqual(nodes(h.tree).find(n => n.type === 'Text').props.allowFontScaling, false);
    h.colors.scheme = 'light'; await h.update(); assert.equal(h.tree.props.accessibilityState.busy, false);
    await h.act(async () => h.tree.props.onPress()); assert.equal(calls, 2);
  } finally { await h.unmount(); }
});

test('Product detail fetch failures are retryable and do not become missing listings', async () => {
  const h = harness('components/vault/ProductDetail.tsx', { productId: 'p' }); let calls = 0;
  h.services.fetchCreatorProduct = async () => { if (++calls === 1) throw Error('offline'); return product({ id: 'p', creatorId: 'creator', productType: 'digital' }); };
  h.services.fetchProfileById = async () => null; h.services.vaultCoverUrl = () => null;
  try {
    await h.mount(); const feedback = find(h, 'ReadFeedback'); assert.equal(feedback.props.status, 'error');
    await h.act(async () => feedback.props.retry()); assert.equal(find(h, 'ProductAction').props.product.id, 'p'); assert.equal(calls, 2);
  } finally { await h.unmount(); }
});
