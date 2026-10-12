/**
 * Arena engagement regression harness — controlled React/RN bridge for hooks and
 * composers. Not physical-device verification.
 *
 * Root cause previously: Module mocks gated on `filename.includes('/Clash/')`,
 * which fails in short-path worktrees (e.g. C:\p11e). Ownership is now rooted at
 * the package directory via path.resolve(__dirname, '..').
 */
const fs = require('fs');
const path = require('node:path');
const Module = require('module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');
const React = require('react');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

function isOwnFile(file) {
  if (typeof file !== 'string' || !file) return false;
  const resolved = path.resolve(file);
  if (resolved.includes(`${path.sep}node_modules${path.sep}`)) return false;
  return resolved === ROOT || resolved.startsWith(ROOT_PREFIX);
}

for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (mod, file) => {
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: [
        '@babel/preset-typescript',
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code;
    mod._compile(code, file);
  };
}

let cells = [];
let index = 0;
let effects = [];
let uid = 'a';
let events = [];
let routes = [];
let postCalls = 0;
let uploadCalls = 0;
let postImpl;
let reactionImpl;
let pickImpl;
let gifImpl;
let discoveryImpl;
let discoveryCalls = 0;

const hooks = {
  ...React,
  useState(v) {
    const i = index++;
    if (!(i in cells)) cells[i] = v;
    return [
      cells[i],
      (n) => {
        cells[i] = typeof n === 'function' ? n(cells[i]) : n;
      },
    ];
  },
  useRef(v) {
    const i = index++;
    if (!(i in cells)) cells[i] = { current: v };
    return cells[i];
  },
  useCallback(f, deps) {
    const i = index++;
    const old = cells[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) cells[i] = { deps, callback: f };
    return cells[i].callback;
  },
  useEffect(f, deps) {
    const i = index++;
    const old = cells[i];
    if (!old || !deps || deps.some((d, j) => d !== old.deps?.[j])) {
      effects.push(() => {
        old?.cleanup?.();
        cells[i] = { deps, setup: f, cleanup: f() };
      });
    }
  },
};

const RN = {
  View: 'View',
  Text: 'Text',
  TextInput: 'Input',
  Pressable: 'Button',
  Image: 'Image',
  ActivityIndicator: 'Spinner',
  Modal: 'Modal',
  FlatList: 'List',
  Platform: { OS: 'ios', select: (spec) => spec.ios ?? spec.default },
  StyleSheet: { create: (x) => x, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 360, height: 800 }),
};

const state = {
  viewer: { id: 'profile-a', name: 'A', tint: '#888' },
  takes: [],
  upvotedCommentIds: [],
  reactedTakeIds: [],
};

const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;
const timers = new Set();
global.setInterval = (fn, ms) => {
  const id = realSetInterval(fn, ms);
  timers.add(id);
  // ArenaClashes polls discovery; do not keep the Node process alive after checks.
  if (typeof id?.unref === 'function') id.unref();
  return id;
};
global.clearInterval = (id) => {
  timers.delete(id);
  return realClearInterval(id);
};

const original = Module._load;
Module._load = function load(request, parent) {
  const file = parent?.filename ?? '';
  const own = isOwnFile(file);
  const slashFile = file.replaceAll('\\', '/');

  if (own && request === 'react') return hooks;
  if (request === 'react-native') return RN;
  if (request === 'react-native-safe-area-context') {
    return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  }
  if (request === 'expo-router') {
    return {
      useFocusEffect(fn) {
        const i = index++;
        const old = cells[i];
        effects.push(() => {
          old?.cleanup?.();
          const cleanup = fn();
          cells[i] = {
            focus: true,
            cleanup: typeof cleanup === 'function' ? cleanup : undefined,
          };
        });
      },
      useRouter: () => ({
        push: (route) => routes.push(route),
        replace: (route) => routes.push(route),
        back() {},
      }),
    };
  }
  if (own && (request.endsWith('/AuthProvider') || request.endsWith('/store/AuthProvider'))) {
    return { useAuth: () => ({ user: uid ? { id: uid } : null }) };
  }
  if (own && request.endsWith('/useRequireAuth')) {
    return { useRequireAuth: () => () => Boolean(uid) };
  }
  if (
    own &&
    (request === '../../store' ||
      request === '../store' ||
      request.endsWith('/store') ||
      request === './store')
  ) {
    return {
      useClash: () => ({ state, dispatch: (e) => events.push(e) }),
      selectHasReacted: () => false,
      reactToTake: (id) => ({ kind: 'optimistic', id }),
      syncTakeReaction: (id, ...rest) => ({ kind: 'sync', id, rest }),
      createComment: (c) => ({ kind: 'comment', c }),
      showNotice: (text) => ({ kind: 'notice', text }),
    };
  }
  if (own && request.endsWith('/supabaseClient')) {
    return { currentUserId: async () => uid, errorText: (e) => e.message };
  }
  if (own && request.endsWith('/apiService')) {
    return {
      postComment: async (...a) => {
        postCalls++;
        return postImpl(...a);
      },
      toggleTakeReaction: (...a) => reactionImpl(...a),
    };
  }
  if (own && request.endsWith('/useMediaPicker')) {
    return {
      useMediaPicker: () => ({
        pickImage: () => pickImpl(),
        pickVideo: () => pickImpl(),
      }),
    };
  }
  if (own && request.endsWith('/mediaService')) {
    return {
      createUpload: async () => {
        uploadCalls++;
        return { id: 'upload', bucket: 'public', path: 'owned' };
      },
      readPickedBytes: async () => new Uint8Array([1]),
      uploadFile: async () => {},
      completeUpload: async () => {},
      failUpload: async () => {},
      getPublicMediaUrl: () => 'https://storage.example/owned',
    };
  }
  if (own && request.endsWith('/services/gif')) {
    return {
      getGifProviderStatus: () => ({ configured: true, label: 'Tenor' }),
      getGifProvider: () => ({
        search: (q, p) => gifImpl(q, p),
        trending: (p) => gifImpl('', p),
      }),
    };
  }
  if (own && request.endsWith('/arenaClashDiscoveryService')) {
    return {
      fetchClashDiscovery: async () => {
        discoveryCalls++;
        return discoveryImpl();
      },
    };
  }
  if (own && request.endsWith('/useDebouncedValue')) {
    return { useDebouncedValue: (v) => v };
  }
  if (own && request.endsWith('/analytics')) {
    return { analytics: { track() {} } };
  }
  if (own && request.endsWith('/haptics')) {
    return { tap() {}, press() {} };
  }
  if (own && (request.endsWith('/theme') || request.endsWith('/theme/index'))) {
    return {
      space: { xs: 4, sm: 8, md: 16, lg: 24 },
      radius: { xxl: 24 },
      layout: {},
      typeScale: {},
      useThemeColors: () => ({}),
    };
  }
  if (own && request.endsWith('/icons')) {
    return new Proxy({}, { get: (_, key) => String(key) });
  }
  if (own && request.endsWith('/Avatar')) return { Avatar: 'Avatar' };
  if (own && request.endsWith('/TakeMediaPreview')) {
    return { TakeMediaPreview: 'Preview' };
  }
  if (own && request.endsWith('/LivePulse')) return { LivePulse: 'LivePulse' };
  if (slashFile.endsWith('/RebuttalInput.tsx') && request.endsWith('/GifPickerSheet')) {
    return { GifPickerSheet: 'Picker' };
  }
  return original.apply(this, arguments);
};

const { useOperationScope } = require('../hooks/useOperationScope.ts');
const { useTakeReaction } = require('../hooks/useTakeReaction.ts');
const { RebuttalInput } = require('../components/arena/RebuttalInput.tsx');
const { GifPickerSheet } = require('../components/arena/GifPickerSheet.tsx');
const { ArenaClashes } = require('../components/arena/ArenaClashes.tsx');

const render = (fn, props) => {
  index = 0;
  const out = typeof fn === 'function' && fn.length === 0 ? fn() : fn(props);
  const run = effects;
  effects = [];
  run.forEach((f) => f());
  return out;
};

const reset = () => {
  for (const c of cells) c?.cleanup?.();
  for (const id of timers) realClearInterval(id);
  timers.clear();
  cells = [];
  effects = [];
  events = [];
  routes = [];
  uid = 'a';
  postCalls = 0;
  uploadCalls = 0;
  discoveryCalls = 0;
  discoveryImpl = async () => [];
};

const nodes = (v) =>
  !v || typeof v !== 'object'
    ? []
    : [v, ...React.Children.toArray(v.props?.children).flatMap(nodes)];
const find = (tree, label) => {
  const node = nodes(tree).find((n) => n.props?.accessibilityLabel === label);
  assert.ok(node, 'missing ' + label);
  return node;
};
const textOf = (tree) => {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return React.Children.toArray(tree?.props?.children)
    .map(textOf)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};
const input = (tree) => nodes(tree).find((n) => n.type === 'Input');
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

let checks = 0;
const pass = (title) => {
  checks++;
  console.log('PASS ' + title);
};

(async () => {
  reset();
  const a = render(() => useOperationScope(uid));
  for (const c of cells) {
    if (c?.setup) {
      c.cleanup?.();
      c.cleanup = c.setup();
    }
  }
  assert.equal(a(), true);
  pass('effect cleanup and setup preserves Strict Mode operation availability');
  uid = 'b';
  const b = render(() => useOperationScope(uid));
  uid = 'a';
  const again = render(() => useOperationScope(uid));
  assert.equal(a(), false);
  assert.equal(b(), false);
  assert.equal(again(), true);
  reset();
  assert.equal(again(), false);
  pass('A to B to A and unmount invalidate old operations');

  const d = deferred();
  reactionImpl = () => d.promise;
  let react = render(useTakeReaction);
  const task = react({ id: 'take', reactions: 2 });
  await react({ id: 'take', reactions: 2 });
  assert.equal(events.length, 1);
  uid = 'b';
  render(useTakeReaction);
  d.resolve({ takeId: 'take', reacted: true, reactionsCount: 3 });
  await task;
  assert.equal(events.filter((e) => e.kind === 'sync').length, 0);
  pass('duplicate reaction taps guarded; switched account ignores late result');

  reset();
  postImpl = async () => {
    throw Error('offline');
  };
  pickImpl = async () => ({
    kind: 'image',
    uri: 'file://test.jpg',
    width: 100,
    height: 100,
  });
  let tree = render(RebuttalInput, { takeId: 'take' });
  input(tree).props.onChangeText('Kept reply');
  tree = render(RebuttalInput, { takeId: 'take' });
  find(tree, 'Attach photo').props.onPress();
  await flush();
  tree = render(RebuttalInput, { takeId: 'take' });
  const send = find(tree, 'Send');
  send.props.onPress();
  send.props.onPress();
  await flush();
  tree = render(RebuttalInput, { takeId: 'take' });
  assert.equal(postCalls, 1);
  assert.equal(uploadCalls, 1);
  assert.equal(input(tree).props.value, 'Kept reply');
  assert.ok(nodes(tree).some((n) => n.props?.accessibilityRole === 'alert'));
  pass('failed media reply keeps draft and blocks repeated taps');

  postImpl = async () => ({ id: 'reply' });
  find(tree, 'Send').props.onPress();
  await flush();
  tree = render(RebuttalInput, { takeId: 'take' });
  assert.equal(uploadCalls, 1);
  assert.equal(postCalls, 2);
  assert.equal(input(tree).props.value, '');
  assert.equal(events.filter((e) => e.kind === 'comment').length, 1);
  pass('reply retry reuses completed owned upload and clears only after confirmation');

  const late = deferred();
  postImpl = () => late.promise;
  input(tree).props.onChangeText('Former account');
  tree = render(RebuttalInput, { takeId: 'take' });
  find(tree, 'Send').props.onPress();
  await flush();
  uid = 'b';
  tree = render(RebuttalInput, { takeId: 'take' });
  tree = render(RebuttalInput, { takeId: 'take' });
  input(tree).props.onChangeText('New account draft');
  tree = render(RebuttalInput, { takeId: 'take' });
  late.resolve({ id: 'old-reply' });
  await flush();
  tree = render(RebuttalInput, { takeId: 'take' });
  assert.equal(input(tree).props.value, 'New account draft');
  assert.equal(events.filter((e) => e.kind === 'comment').length, 1);
  pass('late reply cannot enter new account store or erase new draft');

  reset();
  const pages = new Map();
  gifImpl = (q, pos) => {
    const pending = deferred();
    pages.set(q + ':' + (pos ?? ''), pending);
    return pending.promise;
  };
  const props = { visible: true, onClose() {}, onSelect() {} };
  tree = render(GifPickerSheet, props);
  await flush();
  assert.ok(
    nodes(tree).some((n) => n.type === 'Spinner'),
    'GIF picker shows loading spinner before first page',
  );
  pass('GIF picker surfaces loading state before results arrive');

  input(tree).props.onChangeText('new');
  tree = render(GifPickerSheet, props);
  await flush();
  const gif = {
    id: 'new-gif',
    provider: 'tenor',
    url: 'https://media.tenor.com/a.gif',
    previewUrl: 'https://media.tenor.com/a.gif',
    width: 100,
    height: 100,
    description: 'New',
  };
  pages.get('new:').resolve({ results: [gif], next: 'page2' });
  await flush();
  pages.get(':').resolve({ results: [{ ...gif, id: 'old-gif' }], next: null });
  await flush();
  tree = render(GifPickerSheet, props);
  let list = nodes(tree).find((n) => n.type === 'List');
  assert.deepEqual(
    list.props.data.map((x) => x.id),
    ['new-gif'],
  );
  pass('older GIF search cannot overwrite newer query');

  list.props.onEndReached();
  list.props.onEndReached();
  await flush();
  pages.get('new:page2').resolve({ results: [gif, { ...gif, id: 'second' }], next: 'page2' });
  await flush();
  tree = render(GifPickerSheet, props);
  list = nodes(tree).find((n) => n.type === 'List');
  assert.deepEqual(
    list.props.data.map((x) => x.id),
    ['new-gif', 'second'],
  );
  list.props.onEndReached();
  assert.equal(pages.size, 3);
  pass('GIF paging deduplicates delivery and stops repeated cursors');

  reset();
  gifImpl = async () => ({ results: [], next: null });
  tree = render(GifPickerSheet, { visible: true, onClose() {}, onSelect() {} });
  await flush();
  tree = render(GifPickerSheet, { visible: true, onClose() {}, onSelect() {} });
  assert.match(textOf(tree), /No GIFs found/);
  pass('empty GIF results show honest empty state');

  reset();
  uid = null;
  discoveryImpl = async () => {
    throw new Error('should not fetch while signed out');
  };
  tree = render(ArenaClashes, { topics: [], onEnter() {}, onWatch() {} });
  await flush();
  tree = render(ArenaClashes, { topics: [], onEnter() {}, onWatch() {} });
  assert.match(textOf(tree), /Sign in to see your Challenges and Clash history/);
  assert.equal(discoveryCalls, 0);
  find(tree, 'Open Challenge Inbox').props.onPress();
  assert.deepEqual(routes, ['/arena/challenges']);
  pass('signed-out Clashes show empty guidance and Challenge Inbox entry');

  reset();
  discoveryImpl = async () => [];
  tree = render(ArenaClashes, { topics: [], onEnter() {}, onWatch() {} });
  assert.match(textOf(tree), /Loading Clashes/);
  await flush();
  tree = render(ArenaClashes, { topics: [], onEnter() {}, onWatch() {} });
  assert.ok(discoveryCalls >= 1);
  assert.match(textOf(tree), /No pending Clashes/);
  assert.doesNotMatch(textOf(tree), /Loading Clashes/);
  pass('signed-in Clashes leave loading and show empty section copy');

  for (const id of timers) realClearInterval(id);
  timers.clear();
  console.log(
    checks +
      '/' +
      checks +
      ' Arena engagement checks passed; hook bridge, not native verification.',
  );
})().catch((error) => {
  console.error(error);
  for (const id of timers) realClearInterval(id);
  timers.clear();
  process.exitCode = 1;
});
