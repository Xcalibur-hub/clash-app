const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { row } = require('./arena-room-harness.cjs');

// The real ReactDOM reconciler mounts the actual hook; it renders no host nodes.
// This tiny event-capable container is not a browser or React Native renderer.
const documentStub = { nodeType: 9, addEventListener() {}, removeEventListener() {},
  activeElement: null, body: null, documentElement: { nodeName: 'HTML' } };
const windowStub = { document: documentStub, HTMLIFrameElement: function () {}, HTMLElement: function () {},
  addEventListener() {}, removeEventListener() {} };
documentStub.defaultView = windowStub;
global.window = windowStub; global.document = documentStub; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const message = (id, n, count = 0, body = 'old') => ({ ...row(id, n), body,
  reactions: [{ emoji: 'fire', count, viewerReacted: count > 0 }] });

function mountedRoom({ strict = false, rootStrict = false, suspend = false, roomId: initialRoomId = 'room' } = {}) {
  const modules = new Map(), observations = [], owners = [], readTokens = [];
  let toggles = 0, completions = 0, suspensions = 0;
  let rendering = false, insert, flushHydration, controller, committed, forceRender, shouldSuspend = false;
  let activeRoomId = initialRoomId;
  const renderViews = [];
  const never = new Promise(() => {});
  const server = new Map();
  const services = {
    fetchRoom: async (id) => ({ id: id ?? activeRoomId, roomMode: 'GROUP', status: 'LIVE' }),
    fetchOfficialPage: async () => [], fetchEvidence: async () => [],
    fetchMessage: async id => server.get(id) ?? null,
    reactMessage: async id => {
      toggles++;
      const prior = server.get(id), selected = !prior.reactions[0]?.viewerReacted;
      const count = selected ? 1 : 0;
      server.set(id, { ...prior, reactions: [{ emoji: 'fire', count, viewerReacted: selected }] });
      return { messageId: id, emoji: 'fire', count, reacted: selected };
    },
    fetchVisibleMessageIds: async (_room, ids) => ids,
    subscribeRoomMessages: (_room, onInsert) => { insert = onInsert; return () => {}; },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file,
      babelrc: false, configFile: false, presets: ['@babel/preset-typescript'],
      plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    vm.runInThisContext('(function(module,exports,require,setTimeout,clearTimeout,setInterval,clearInterval){' + code + '\n})')(
      module, module.exports, dependency => {
        if (dependency === 'react') return React;
        if (dependency === 'expo-router') return { useFocusEffect() {} };
        if (dependency === 'react-native') return { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
        if (dependency === '../store') return { useClash: () => ({ dispatch() {} }), showNotice: value => value };
        if (dependency.endsWith('/liveArenaService')) return services;
        if (dependency.endsWith('/supabaseClient')) return { currentUserId: async () => 'account', errorText: String, SupabaseError: Error };
        if (dependency.endsWith('/officialRequestStore')) return { acquireOfficialRequest: async () => 'request', confirmOfficialRequest: async () => {} };
        if (!dependency.startsWith('.')) throw Error('Unexpected mounted dependency: ' + dependency);
        return load(path.resolve(path.dirname(file), dependency.replace(/\.ts$/, '') + '.ts'));
      }, fn => { flushHydration = fn; return 1; }, () => {}, () => 1, () => {});
    if (file.endsWith(path.join('utils', 'reactionSnapshots.ts'))) {
      const create = module.exports.createReactionSnapshots;
      module.exports.createReactionSnapshots = () => {
        const guard = create(), merge = guard.merge, finish = guard.finishMutation, begin = guard.beginSnapshot;
        guard.beginSnapshot = () => { const token = begin(); readTokens.push(token); return token; };
        guard.finishMutation = id => { completions++; finish(id); };
        guard.merge = (...args) => {
          const result = merge(...args);
          observations.push({ rendering, count: result.find(item => item.id === 'm')?.reactions[0]?.count });
          return result;
        };
        return guard;
      };
    }
    if (file.endsWith(path.join('utils', 'arenaTranscriptStore.ts'))) {
      const create = module.exports.createArenaTranscriptStore;
      module.exports.createArenaTranscriptStore = () => {
        const owner = create(); owners.push(owner); return owner;
      };
    }
    return module.exports;
  }
  const { useLiveArenaRoom } = load('hooks/useLiveArenaRoom.ts');
  function MaySuspend({ messages }) {
    if (shouldSuspend && messages.find(item => item.id === 'm')?.reactions[0]?.count === 7) { suspensions++; throw never; }
    return null;
  }
  function App() {
    rendering = true;
    try {
      const [, tick] = React.useState(0); forceRender = () => tick(value => value + 1);
      controller = useLiveArenaRoom(activeRoomId);
    } finally { rendering = false; }
    const current = controller;
    // Capture pre-paint message identities for room-switch isolation checks.
    renderViews.push({ roomId: activeRoomId, ids: current.messages.map((item) => item.id) });
    React.useLayoutEffect(() => { committed = current; });
    return React.createElement(MaySuspend, { messages: current.messages });
  }
  const root = createRoot({ nodeType: 1, tagName: 'DIV', nodeName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: documentStub,
    addEventListener() {}, removeEventListener() {}, textContent: '' });
  return {
    server, observations, services, renderViews, readTokens,
    get committed() { return committed; },
    get owner() { return owners.find(owner => owner.getSnapshot().some(item => item.id === 'm')) ?? owners[0]; },
    get toggles() { return toggles; }, get completions() { return completions; },
    get suspensions() { return suspensions; },
    async mount() {
      await React.act(async () => {
        let app = React.createElement(App);
        if (strict && !rootStrict) app = React.createElement(React.StrictMode, null, app);
        app = React.createElement(React.Suspense, { fallback: null }, app);
        if (strict && rootStrict) app = React.createElement(React.StrictMode, null, app);
        flushSync(() => root.render(app));
      });
    },
    async switchRoom(nextId) {
      activeRoomId = nextId;
      await React.act(async () => flushSync(forceRender));
    },
    async resume() {
      shouldSuspend = false;
      await React.act(async () => flushSync(forceRender));
    },
    async hydrate(ids, interrupt = false) {
      await React.act(async () => {
        if (interrupt) { shouldSuspend = suspend; React.startTransition(forceRender); }
        else forceRender(); // Prevent the legacy setter's eager-result shortcut.
        for (const id of ids) insert({ id });
        flushHydration();
        for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      });
    },
    async unmount() { await React.act(async () => root.unmount()); },
  };
}


module.exports = { mountedRoom, message, React };
