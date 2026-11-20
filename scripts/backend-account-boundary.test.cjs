// Real React reconciliation, fake providers/transports. No native host or backend.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { transform } = require('sucrase');
const { moduleHarness } = require('./lib/backend-module-harness.cjs');
const documentStub = { nodeType: 9, addEventListener() {}, removeEventListener() {},
  activeElement: null, body: null, documentElement: { nodeName: 'HTML' } };
const windowStub = { document: documentStub, HTMLIFrameElement: function () {}, HTMLElement: function () {},
  addEventListener() {}, removeEventListener() {} };
documentStub.defaultView = windowStub;
global.window = windowStub; global.document = documentStub; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client');
function harness() {
  const modules = moduleHarness('https://eagbgwasiocfppwobpsd.supabase.co');
  let user = { id: 'same-auth-uuid' }, counter = 0, current, setDraft, cleaned = 0;
  const context = { exports: {}, require: name => {
    if (name === 'react') return React;
    if (name === './AuthProvider') return { useAuth: () => ({ user }) };
    if (name === './ClashStore') return { ClashProvider: Provider };
    if (name === '../utils/supabaseEnv') return modules.load('utils/supabaseEnv.ts');
    throw Error('Unexpected import: ' + name);
  } };
  function Provider({ children }) {
    const [instance] = React.useState(() => ++counter);
    React.useEffect(() => () => { cleaned++; }, []);
    return React.createElement(InstanceContext.Provider, { value: instance }, children);
  }
  const InstanceContext = React.createContext(null);
  const scope = { exports: {}, require: () => React };
  vm.runInNewContext(transform(fs.readFileSync('hooks/useOperationScope.ts', 'utf8'),
    { transforms: ['typescript', 'imports'] }).code, scope);
  function Screen() {
    const instance = React.useContext(InstanceContext), [draft, update] = React.useState('empty');
    const isCurrent = scope.exports.useOperationScope('same-route');
    React.useLayoutEffect(() => { current = { instance, draft, isCurrent }; setDraft = update; });
    return null;
  }
  vm.runInNewContext(transform(fs.readFileSync('store/AccountScope.tsx', 'utf8'),
    { transforms: ['typescript', 'imports', 'jsx'] }).code, context);
  const root = createRoot({ nodeType: 1, tagName: 'DIV', nodeName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: documentStub,
    addEventListener() {}, removeEventListener() {}, textContent: '' });
  const render = async () => React.act(async () => root.render(React.createElement(context.exports.AccountScope,
    null, React.createElement(Screen))));
  return { get current() { return current; }, get cleaned() { return cleaned; }, modules, render,
    edit: async value => React.act(async () => setDraft(value)),
    account: value => { user = value ? { id: value } : null; },
    unmount: async () => React.act(async () => root.unmount()) };
}
test('actual AccountScope remounts on project change with the same UUID and rejects disposed callbacks', async () => {
  const h = harness();
  try {
    await h.render(); await h.edit('old private draft');
    const previous = h.current;
    h.modules.env.EXPO_PUBLIC_SUPABASE_URL = 'https://kgaqejgubjemdecifzew.supabase.co';
    await h.render();
    assert.notEqual(h.current.instance, previous.instance); assert.equal(h.current.draft, 'empty');
    assert.equal(h.cleaned, 1); assert.equal(previous.isCurrent(), false); assert.equal(h.current.isCurrent(), true);
  } finally { await h.unmount(); }
});
test('sign-out and A to B to A do not resurrect screen state or old operation scopes', async () => {
  const h = harness();
  try {
    await h.render(); await h.edit('private'); const first = h.current;
    h.account(null); await h.render(); assert.equal(h.current.draft, 'empty');
    h.account('other'); await h.render(); h.account('same-auth-uuid'); await h.render();
    assert.equal(h.current.draft, 'empty'); assert.notEqual(h.current.instance, first.instance);
    assert.equal(first.isCurrent(), false); assert.equal(h.cleaned, 3);
  } finally { await h.unmount(); }
});
