// Actual React hooks/effects and production components, with offline service/native boundaries.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const babel = require('@babel/core');
const { React } = require('./arena-mounted-room.cjs');
const { createRoot } = require('react-dom/client');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const nodes = value => !value || typeof value !== 'object' ? []
  : [value, ...React.Children.toArray(value.props?.children).flatMap(nodes)];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value)
  : Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : '';
function harness(file, initialProps = {}, select = exports => exports.default ?? Object.values(exports)[0], options = {}) {
  const cache = new Map(), serviceFunctions = new Map(), calls = [], events = [], services = {}, drafts = [], colors = {
    background: '#08080B', textPrimary: '#FAFAF8', textSecondary: '#ccc', textMuted: '#aaa',
    border: '#333', surface: '#222', surfaceMuted: '#222', surfaceElevated: '#222', textInverse: '#111', scheme: 'dark',
  };
  let auth = { user: { id: 'account-a' }, signedIn: true, loading: false }, tree, props = initialProps;
  const motion = { reduced: true }, animations = [];
  const dimensions = { width: 360, height: 800, fontScale: 1 };
  const animation = kind => ({ duration(ms) { animations.push([kind, ms]); return { kind, ms }; } });
  const state = { realm: 'arena', viewer: { id: 'profile-a', name: 'Fictional A' }, themeMode: 'dark' };
  const router = { push: href => calls.push(['push', href]), replace: href => calls.push(['replace', href]), back: () => calls.push(['back']), canGoBack: () => false };
  const leafNames = ['WorldDropsShelf', 'ExploreDiscoveryCard', 'ExploreMediaTile', 'ProfileHero', 'ReputationBar',
    'TakeMiniCard', 'ProfileClashRow', 'SubscriptionInfoSheet', 'VaultDropCard', 'EmptyState', 'PressableScale', 'SegmentedTabs', 'Notice'];
  const leaves = Object.fromEntries(leafNames.map(name => [name, { [name]: name }]));
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
      presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    function dependency(name) {
      const base = path.basename(name);
      if (options.dependencies?.[base]) return options.dependencies[base];
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return { ...Object.fromEntries(['View', 'Text', 'TextInput', 'Modal', 'Pressable', 'ScrollView', 'FlatList', 'Image', 'ActivityIndicator'].map(k => [k, k])),
        StyleSheet: { create: x => x, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} }, Linking: { openURL: url => services.openURL(url) },
        useWindowDimensions: () => dimensions, BackHandler: { addEventListener: () => ({ remove() {} }) } };
      if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'View', FlatList: 'FlatList', createAnimatedComponent: x => x },
        useReducedMotion: () => motion.reduced, useAnimatedScrollHandler: fn => fn,
        useSharedValue: value => React.useRef({ value }).current, useAnimatedStyle: fn => fn(), withSpring: x => x,
        withTiming: (x, config) => { animations.push(['timing', config?.duration]); return x; }, withSequence: (...values) => values.at(-1),
        cancelAnimation: () => animations.push(['cancel']), FadeIn: animation('fade'), FadeInUp: animation('rise'),
        Easing: { in: x => x, out: x => x, cubic: x => x, quad: x => x }, runOnJS: fn => fn };
      if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', Defs: 'Defs', RadialGradient: 'RadialGradient', Rect: 'Rect', Stop: 'Stop' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'Gradient' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) };
      if (name === 'expo-router') return { useRouter: () => router, usePathname: () => '/settings' };
      if (base === 'AuthProvider') return { useAuth: () => auth };
      if (base === 'store') return { useClash: () => ({ state, dispatch: e => events.push(e) }), selectViewer: () => state.viewer,
        selectViewerTakes: () => drafts, setThemeMode: mode => ({ type: 'theme', mode }), switchRealm: realm => ({ type: 'realm', realm }) };
      if (base === 'theme') return { useThemeColors: () => colors, space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
        layout: { screenX: 16 }, radius: { pill: 99, xxl: 24 }, typeScale: new Proxy({}, { get: () => ({}) }),
        accent: {}, color: {}, ink: {}, ease: { inOut: x => x }, duration: { fast: 100, base: 200 } };
      if (base === 'haptics') return { tap: () => events.push('haptic'), press() {} };
      if (base === 'analytics') return { analytics: { track() {}, trackOnce() {} } };
      if (base === 'icons') return new Proxy({}, { get: (_, key) => String(key) });
      if (base === 'Avatar') return { Avatar: 'Avatar' };
      if (base === 'SidebarContext') return { useSidebar: () => ({ isOpen: true, close: () => events.push('close') }) };
      if (base === 'sidebarStyles') return { sidebar: {}, DRAWER_ICON: '#fff', DRAWER_TEXT_MUTED: '#ccc' };
      if (base === 'useRealmSwitch') return { useRealmSwitch: () => ({ shiftTo() {} }) };
      if (base === 'useClock') return { useClock: () => 10000 };
      if (leaves[base]) return leaves[base];
      if (name.includes('services/')) return new Proxy({}, { get: (_, key) => {
        if (!serviceFunctions.has(key)) serviceFunctions.set(key, (...args) => {
          if (!services[key]) throw Error('Unmocked service: ' + String(key));
          return services[key](...args);
        });
        return serviceFunctions.get(key);
      } });
      if (!name.startsWith('.')) throw Error('Unmocked dependency: ' + name);
      const next = path.resolve(path.dirname(filename), name);
      return load(/\.tsx?$/.test(next) ? next : fs.existsSync(next + '.tsx') ? next + '.tsx' : next + '.ts');
    }
    vm.runInThisContext('(function(module,exports,require,setTimeout,clearTimeout){' + code + '\n})')(
      module, module.exports, dependency, options.setTimeout ?? setTimeout, options.clearTimeout ?? clearTimeout);
    return module.exports;
  }
  const exports = load(file), Component = select(exports);
  function Probe() { tree = Component(props); return null; }
  const root = createRoot({ nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: global.document, addEventListener() {}, removeEventListener() {}, textContent: '' });
  const render = () => React.act(async () => { root.render(React.createElement(Probe)); });
  return { services, calls, events, state, drafts, colors, router, load, motion, animations, dimensions,
    get tree() { return tree; }, get nodes() { return nodes(tree); },
    get auth() { return auth; }, set auth(value) { auth = value; },
    mount: render, async update(next = props) { props = next; await render(); },
    act: React.act, async unmount() { await React.act(async () => root.unmount()); },
  };
}
module.exports = { harness, deferred, nodes, text, React };
