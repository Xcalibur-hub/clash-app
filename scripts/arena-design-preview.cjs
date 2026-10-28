/* Offline visual evidence of the actual Take route, bridged to React Native Web.
 * Fixtures never enter the app/store/backend. No native or backend pass implied.
 * BEFORE is read from the exact PR #75 commit; no historical file is rewritten. */
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const babel = require('@babel/core'), React = require('react'), RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const base = '8b42768ff62510a74de1a36c3ebb5bbf16622161';
const now = Date.parse('2026-10-18T10:00:00Z');
const noop = () => {}, originalLoad = Module._load;
let before = false, scheme = 'dark', archived = false, width = 360, scale = 1, keyboard = false, reduced = true, theme, state, motionCalls = [];
const snapshots = new Map();
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (m, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (before && filename.startsWith(root + path.sep) && !filename.includes('node_modules')) {
    const relative = path.relative(root, filename).replaceAll('\\', '/');
    if (!snapshots.has(relative)) snapshots.set(relative, execFileSync('git', ['show', `${base}:${relative}`], { cwd: root, encoding: 'utf8' }));
    source = snapshots.get(relative);
  }
  m._compile(babel.transformSync(source, { filename, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code, filename);
};
const author = { id: 'preview-author', name: 'Alex Morgan', handle: 'alexm', tint: '#74747E' };
const viewer = { id: 'preview-reader', name: 'Sam Lee', handle: 'samlee', tint: '#74747E' };
const take = () => ({ id: 'preview-only', authorId: author.id, hood: 'techtakes',
  text: 'The best technology gives us our attention back.', createdAt: now - 2 * 3600000,
  expiresAt: archived ? now - 3600000 : now + 6 * 3600000, status: archived ? 'expired' : 'active',
  reactions: 24, clashes: 0, isRuntimeFixture: true });
const comments = () => [
  { id: 'preview-root', takeId: 'preview-only', authorId: viewer.id, text: 'Useful tools should make it easier to leave the screen. That’s a better measure than time spent.', upvotes: 8, createdAt: now - 25 * 60000 },
  { id: 'preview-child', takeId: 'preview-only', parentId: 'preview-root', authorId: author.id, text: 'Exactly. Less friction, more intention.', upvotes: 3, createdAt: now - 12 * 60000 },
];
const chain = { duration(ms) { motionCalls.push(ms); return this; } };
const animation = { __esModule: true, default: { View: RN.View, Text: RN.Text, createAnimatedComponent: c => c },
  LinearTransition: chain, FadeIn: chain, FadeInDown: chain, FadeOut: chain,
  useReducedMotion: () => reduced, useSharedValue: value => ({ value }), useAnimatedStyle: f => f(),
  withTiming: x => x, withSpring: x => x, withDelay: (_, x) => x, withSequence: x => x,
  withRepeat: x => x, cancelAnimation: noop, runOnJS: fn => fn,
  Extrapolation: { CLAMP: 'clamp' },
  interpolate: (value, input, output) => {
    const progress = Math.max(0, Math.min(1, (value - input[0]) / (input[1] - input[0])));
    return output[0] + progress * (output[1] - output[0]);
  },
  Easing: { bezier: () => ({}), out: x => x, inOut: x => x },
};
let controlling = null, stateIndex = 0;
const previewHooks = { ...React, useState(initial) {
  const slot = controlling ? stateIndex++ : -1;
  // Replay resolved empty challenge data and focused composer without executing effects.
  if (controlling === 'challenges' && slot === (before ? 8 : 9)) initial = true;
  if (controlling === 'composer' && slot === 4 && keyboard) initial = true;
  return React.useState(initial);
} };
function controlled(component, name) {
  return props => { controlling = name; stateIndex = 0; try { return component(props); } finally { controlling = null; } };
}
Module._load = function (request, parent) {
  if (request === './elements' && parent?.filename.includes('react-native-svg')) return originalLoad.call(this, './elements.web', parent);
  const own = parent && parent.filename.startsWith(root + path.sep) && !parent.filename.includes('node_modules');
  if (own && request === 'react') return previewHooks;
  if (request === 'react-native') return { ...RN,
    Text: props => { const style = RN.StyleSheet.flatten(props.style) || {}; return React.createElement(RN.Text, { ...props, style: [props.style, props.allowFontScaling === false ? null : { fontSize: (style.fontSize || 14) * scale, lineHeight: (style.lineHeight || 20) * scale }] }); },
    useWindowDimensions: () => ({ width, height: 800, scale: 1, fontScale: scale }),
    KeyboardAvoidingView: RN.View,
    FlatList: ({ data, renderItem, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, contentContainerStyle, keyExtractor }) => React.createElement(RN.View, { style: { flex: 1, overflow: 'auto' }, testID: 'preview-scroll' }, React.createElement(RN.View, { style: contentContainerStyle }, ListHeaderComponent, data.map((item, index) => React.createElement(React.Fragment, { key: keyExtractor ? keyExtractor(item) : item.id ?? index }, renderItem({ item, index }))), !data.length && ListEmptyComponent, ListFooterComponent)),
    Modal: ({ visible, children }) => visible ? React.createElement(RN.View, null, children) : null,
  };
  if (request === 'react-native-svg') return originalLoad.call(this, 'react-native-svg/lib/commonjs/ReactNativeSVG.web.js', parent);
  if (request === 'react-native-reanimated') return animation;
  if (request === 'react-native-gesture-handler') {
    const pan = { enabled() { return this; }, activeOffsetX() { return this; }, failOffsetY() { return this; },
      onBegin() { return this; }, onUpdate() { return this; }, onEnd() { return this; } };
    return { Gesture: { Pan: () => pan }, GestureDetector: ({ children }) => children, GestureHandlerRootView: RN.View };
  }
  if (request === 'expo-linear-gradient') return { LinearGradient: ({ style, children }) => React.createElement(RN.View, { style }, children) };
  if (request === 'expo-constants') return { expoConfig: { extra: { appVariant: 'preview' } } };
  if (request === 'expo-router') return { useRouter: () => ({ canGoBack: () => true, back: noop, push: noop, replace: noop }), useFocusEffect: noop, useLocalSearchParams: () => ({ takeId: 'preview-only' }) };
  if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 12, bottom: 12 }) };
  if (own && /\/theme$/.test(request)) return theme;
  if (own && /\/store$/.test(request)) return { useClash: () => ({ state, dispatch: noop }), selectAuthor: (_, id) => id === author.id ? author : viewer,
    selectCommentsForTake: () => state.comments, buildCommentTree: () => [{ comment: state.comments[0], children: [{ comment: state.comments[1], children: [] }] }], selectIsSaved: () => false, selectHasReacted: () => false };
  if (own && request.endsWith('/AuthProvider')) return { useAuth: () => ({ user: viewer, signedIn: true, loading: false }) };
  if (own && request.endsWith('/useClock')) return { useClock: () => now };
  if (own && request.endsWith('/useKeyboardVisible')) return { useKeyboardVisible: () => keyboard };
  if (own && request.endsWith('/useOperationScope')) return { useOperationScope: () => () => true };
  if (own && request.endsWith('/useRequireAuth')) return { useRequireAuth: () => () => true };
  if (own && request.endsWith('/useTakeReaction')) return { useTakeReaction: () => noop };
  if (own && request.endsWith('/useMediaPicker')) return { useMediaPicker: () => ({ pickImage: noop, pickVideo: noop }) };
  if (own && request.endsWith('/useMindshift')) return { useMindshift: () => ({ stance: null, stats: null, busy: false, recordInitial: noop, recordFinal: noop }) };
  if (own && /\/(PostActionsSheet|ClashModeSheet|GifPickerSheet|FullScreenChallengeDeck|ClashConfirmedOverlay|MediaViewer|TakeMediaPreview|CommentMedia)$/.test(request)) return new Proxy({}, { get: (_, k) => k === '__esModule' ? false : () => null });
  if (own && request.endsWith('/supabaseClient')) return { isSupabaseConfigured: false, isLocalSupabase: false, errorText: e => e.message };
  if (own && request.includes('/services/')) return new Proxy({}, { get: (_, k) => k === '__esModule' ? false : k.startsWith('MINDSHIFT') ? 3 : k === 'analytics' ? { trackOnce: noop } : k === 'logger' ? { warn: noop } : () => { throw Error('Network disabled in UI preview'); } });
  if (own && request.endsWith('/haptics')) return { press: noop, tap: noop };
  const result = originalLoad.apply(this, arguments);
  if (own && request.endsWith('/TakeChallenges')) return { ...result, TakeChallenges: controlled(result.TakeChallenges, 'challenges') };
  if (own && request.endsWith('/RebuttalInput')) return { ...result, RebuttalInput: controlled(result.RebuttalInput, 'composer') };
  return result;
};
const tokens = { ...require('../theme/layout.ts'), ...require('../theme/typography.ts'), ...require('../theme/motion.ts'), ...require('../theme/colors.ts') };
const palettes = require('../theme/palettes.ts');
const realNow = Date.now; Date.now = () => now;
function render(options) {
  ({ before, scheme, archived, width, scale = 1, keyboard = false, reduced = true } = options);
  motionCalls = [];
  for (const key of Object.keys(require.cache)) if (key.startsWith(root + path.sep) && !key.includes('node_modules')) delete require.cache[key];
  theme = { ...tokens, useThemeColors: () => palettes[scheme + 'Theme'], useTheme: () => ({ scheme }) };
  state = { viewer, takes: [{ ...take(), isRuntimeFixture: false }], users: [author, viewer], comments: comments(), upvotedCommentIds: [] };
  const Screen = require('../app/take/[takeId].tsx').default;
  const markup = renderToStaticMarkup(React.createElement(RN.View, { style: { width, height: keyboard ? 500 : 800, overflow: 'hidden' } }, React.createElement(Screen)));
  assert.ok(markup.includes('The best technology'), 'actual route rendered fixture statement');
  assert.ok(archived ? !markup.includes('Write a reply') : markup.includes('Write a reply'), 'archive has no editable composer');
  const { getStyleElement } = RN.AppRegistry.getApplication('ArenaDesignPreview');
  const css = renderToStaticMarkup(getStyleElement());
  return { markup, css, motionCalls: [...motionCalls] };
}
RN.AppRegistry.registerComponent('ArenaDesignPreview', () => () => null);
module.exports = { render, base };
if (require.main === module) {
  const output = process.argv[2]; assert.ok(output, 'Provide an ignored output directory');
  const target = path.resolve(output); assert.ok(target.startsWith(path.join(root, '.expo') + path.sep), 'Preview output must be isolated under .expo');
  fs.mkdirSync(target, { recursive: true });
  const cases = [];
  for (const scheme of ['dark', 'light']) for (const archived of [false, true]) for (const width of [320, 360]) cases.push({ scheme, archived, width });
  cases.push({ scheme: 'dark', archived: false, width: 320, keyboard: true }, { scheme: 'light', archived: false, width: 320, scale: 1.4 });
  for (const options of cases) {
    const { scheme, archived, width, keyboard, scale } = options;
    const panels = [true, false].map(before => {
      const { markup, css } = render({ ...options, before });
      return `${css}<section><h2>${before ? 'BEFORE · PR #75' : 'AFTER · Arena v1'}</h2>${markup}${keyboard ? '<aside style="height:300px;background:#232326;color:#ccc;padding:20px;box-sizing:border-box">SIMULATED IME AREA<br>Layout check only, not an Android keyboard</aside>' : ''}</section>`;
    });
    const bg = palettes[scheme + 'Theme'].background, ink = palettes[scheme + 'Theme'].textPrimary;
    const fontCSS = ['400Regular', '500Medium', '600SemiBold', '700Bold'].map(face => {
      const font = require('node:url').pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', face, `Inter_${face}.ttf`)).href;
      return `@font-face{font-family:Inter_${face};src:url('${font}')} `;
    }).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>CLASH UI PREVIEW — fictional offline fixtures</title><style>${fontCSS}*{scrollbar-width:none}::-webkit-scrollbar{display:none}body{margin:0;padding:16px;background:${bg};color:${ink};font-family:Arial}h1{font-size:13px;font-weight:500;margin:0 0 12px}h2{font-size:11px;letter-spacing:1px;margin:0 0 8px}main{display:flex;gap:16px}section{width:${width}px;border:1px solid ${scheme === 'dark' ? '#303035' : '#D5D3CF'}}</style><h1>UI PREVIEW ONLY · ${scheme} · ${archived ? 'archived' : 'active'} · ${width} dp${scale ? ' · 140% text' : ''}${keyboard ? ' · simulated IME' : ''} · not native</h1><main>${panels.join('')}</main>`;
    fs.writeFileSync(path.join(target, `${scheme}-${archived ? 'archived' : 'active'}-${width}${keyboard ? '-keyboard' : scale ? '-fontscale' : ''}.html`), html);
  }
  console.log(JSON.stringify({ comparisons: cases.length, base, network: false, fixtures: 'offline preview only', native: false }));
}
Date.now = realNow;
