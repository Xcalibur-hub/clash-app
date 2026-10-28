const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const forbidden = () => { throw Error('Backend access forbidden in layout tests'); };
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function load(file, dependencies, native = false) {
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, babelrc: false, configFile: false,
    presets: native ? ['module:@react-native/babel-preset'] : [
      '@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }],
    ],
    plugins: native ? [] : ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return dependencies.react ?? React;
    if (name.startsWith('react/')) return require(name);
    if (name.startsWith('@babel/runtime/')) return require(name);
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }});
  return exports;
}

function screen(theme, platform, top, bottom, active = true, draft = '', sending = false, imeOpen = false) {
  const records = [];
  const host = kind => props => {
    records.push({ kind, props, style: flatten(props.style) });
    return React.createElement('div', null, props.children);
  };
  const rn = {
    Platform: { OS: platform, select: choices => choices[platform] ?? choices.default },
    StyleSheet: { create: x => x, hairlineWidth: 1 },
    Keyboard: {
      isVisible: () => platform === 'android' && imeOpen,
      addListener: () => ({ remove() {} }),
    },
    ...Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'FlatList',
      'KeyboardAvoidingView', 'ActivityIndicator'].map(name => [name, host(name)])),
  };
  const layout = load('theme/layout.ts', {});
  const typography = load('theme/typography.ts', { 'react-native': rn });
  const tokens = { ...layout, ...typography, ...load('theme/colors.ts', {}),
    scale: { press: 0.985 }, useThemeColors: () => theme };
  const button = load('components/meet/MeetButton.tsx', {
    'react-native': rn, '../../theme': tokens,
    '../shared/buttonTones': load('components/shared/buttonTones.ts', { '../../theme': tokens }),
    '../../utils/haptics': { press() {}, tap() {} },
    'react-native-reanimated': { __esModule: true, default: { View: host('AnimatedView') },
      useSharedValue: value => ({ value }), useAnimatedStyle: fn => fn(), withTiming: x => x },
  });
  let stateIndex = 0;
  const Screen = load('app/explore/meet/[sessionId].tsx', {
    react: {
      ...React,
      useState: initial => {
        const value = typeof initial === 'function' ? initial() : initial;
        // draft → androidImeOpen → androidKavEpoch → remaining screen state.
        if (stateIndex === 0) {
          stateIndex += 1;
          return [draft, () => {}];
        }
        if (stateIndex === 1) {
          stateIndex += 1;
          return [platform === 'android' ? imeOpen : value, () => {}];
        }
        if (stateIndex === 2) {
          stateIndex += 1;
          return [typeof value === 'number' ? value : 0, () => {}];
        }
        stateIndex += 1;
        return [value, () => {}];
      },
      useEffect: () => undefined,
    },
    'react-native': rn, '../../../theme': tokens,
    'expo-router': { useRouter: () => ({ back() {}, push: forbidden, replace: forbidden }),
      useLocalSearchParams: () => ({ sessionId: 'layout-only' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top, bottom }) },
    '../../../components/meet/MeetButton': button,
    '../../../components/meet/MeetReportSheet': { MeetReportSheet: () => null },
    '../../../hooks/useMeetChat': { useMeetChat: () => ({ loading: false,
      session: { sessionId: 'layout-only', peerAlias: 'Fictional B' },
      status: active ? 'active' : 'ended', messages: [], canSend: active,
      sending, error: null, send: forbidden, notifyTyping: forbidden }) },
    '../../../services/analytics': { analytics: { track: forbidden } },
    '../../../services/meetService': {}, '../../../utils/haptics': { tap() {} },
    '../../../utils/meetLifecycle': {}, '../../../utils/meetSafety': {},
  }).default;
  renderToStaticMarkup(React.createElement(Screen));
  return { records, layout };
}

const palettes = load('theme/palettes.ts', {});
for (const theme of [palettes.darkTheme, palettes.lightTheme]) {
  for (const platform of ['android', 'ios']) {
    for (const [top, bottom] of [[0, 0], [24, 16], [44, 34]]) {
      test(`${theme.scheme}/${platform}/${top}/${bottom}: keyboard, insets and touch geometry`, () => {
        const { records: rows, layout } = screen(theme, platform, top, bottom);
        const kav = rows.find(x => x.kind === 'KeyboardAvoidingView');
        assert.equal(kav.props.behavior, platform === 'android' ? 'height' : 'padding');
        assert.equal(kav.props.enabled, platform !== 'android', 'Android KAV off while IME closed');
        assert.equal(kav.style.paddingTop, platform === 'android' ? top : 0);
        const header = rows.find(x => x.style.borderBottomWidth !== undefined);
        assert.equal(header.style.paddingVertical, layout.space.sm);
        assert.equal(header.style.paddingTop, undefined);
        assert.equal(header.style.flexShrink, 0);
        const back = rows.find(x => x.props.accessibilityLabel === 'Back');
        assert.ok(back.style.minHeight >= 44 && back.style.minWidth >= 44);
        assert.equal(rows.find(x => x.props.children === 'Back').style.color, theme.textPrimary);
        const list = rows.find(x => x.kind === 'FlatList');
        assert.equal(list.style.flex, 1);
        assert.equal(list.style.minHeight, 0);
        assert.equal(list.props.keyboardShouldPersistTaps, 'always');
        assert.equal(list.props.keyboardDismissMode, 'none');
        const composer = rows.find(x => x.style.borderTopWidth !== undefined);
        assert.equal(composer.style.flexShrink, 0);
        assert.equal(composer.style.paddingBottom, Math.max(bottom, layout.space.sm));
        const input = rows.find(x => x.kind === 'TextInput');
        assert.equal(input.props.accessibilityLabel, 'Message');
        assert.ok(input.style.minHeight >= 44);
        const send = rows.find(x => x.props.accessibilityLabel === 'Send message');
        assert.ok(send.style.minHeight >= 44 && send.style.minWidth >= 44);
        assert.equal(send.style.flexShrink, 0);
        assert.equal(send.props.disabled, true);
      });
    }
  }
  test(`${theme.scheme}: terminal Leave contrast and preserved bottom inset`, () => {
    const { records, layout } = screen(theme, 'android', 24, 34, false);
    const leave = records.find(x => x.kind === 'Text' && x.props.children === 'Leave');
    assert.equal(leave.style.color, theme.textPrimary);
    const button = records.find(x => x.props.accessibilityLabel === 'Leave');
    assert.equal(button.style.backgroundColor, theme.surface);
    const light = luminance(leave.style.color), dark = luminance(button.style.backgroundColor);
    assert.ok((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) >= 4.5);
    assert.ok(button.style.minHeight >= 44);
    const footer = records.find(x => x.style.borderTopWidth !== undefined);
    assert.equal(footer.style.paddingBottom, Math.max(34, layout.space.sm));
    assert.equal(records.some(x => x.kind === 'TextInput'), false);
  });
  for (const sending of [false, true]) {
    test(`${theme.scheme}: composed draft Send readiness, sending=${sending}`, () => {
      const { records } = screen(theme, 'android', 32, 24, true, 'Local unsent draft', sending);
      const send = records.find(x => x.props.accessibilityLabel === 'Send message');
      assert.equal(send.props.disabled, sending);
      assert.equal(records.find(x => x.kind === 'TextInput').props.editable, !sending);
      assert.equal(records.find(x => x.kind === 'TextInput').props.maxLength, 1000);
      assert.equal(records.find(x => x.kind === 'TextInput').style.maxHeight, 120);
    });
  }
  test(`${theme.scheme}: initial active, terminal and active render contracts retain target sizes`, () => {
    for (const active of [true, false, true]) {
      const { records } = screen(theme, 'android', 32, 48, active);
      const back = records.find(x => x.props.accessibilityLabel === 'Back');
      assert.ok(back.style.minHeight >= 44);
      const target = records.find(x => x.props.accessibilityLabel === (active ? 'Send message' : 'Leave'));
      assert.ok(target.style.minHeight >= 44);
      assert.equal(records.filter(x => x.kind === 'TextInput').length, active ? 1 : 0);
      const kav = records.find(x => x.kind === 'KeyboardAvoidingView');
      assert.equal(kav.props.behavior, 'height');
      assert.equal(kav.props.enabled, false);
    }
  });
}

test('android initial layout keeps height behavior but disables avoidance', () => {
  const { records } = screen(palettes.darkTheme, 'android', 32, 48, true, '', false, false);
  const kav = records.find(x => x.kind === 'KeyboardAvoidingView');
  assert.equal(kav.props.behavior, 'height');
  assert.equal(kav.props.enabled, false);
  assert.equal(kav.style.paddingTop, 32);
  assert.equal(records.find(x => x.kind === 'FlatList').props.keyboardShouldPersistTaps, 'always');
  assert.equal(records.find(x => x.kind === 'FlatList').props.keyboardDismissMode, 'none');
});

test('android IME open enables height avoidance without changing transcript gestures', () => {
  const { records } = screen(palettes.darkTheme, 'android', 32, 48, true, '', false, true);
  const kav = records.find(x => x.kind === 'KeyboardAvoidingView');
  assert.equal(kav.props.behavior, 'height');
  assert.equal(kav.props.enabled, true);
  assert.equal(records.find(x => x.kind === 'FlatList').props.keyboardShouldPersistTaps, 'always');
  assert.equal(records.find(x => x.kind === 'FlatList').props.keyboardDismissMode, 'none');
});

test('android IME dismissal disables avoidance again', () => {
  const open = screen(palettes.darkTheme, 'android', 32, 48, true, '', false, true);
  assert.equal(open.records.find(x => x.kind === 'KeyboardAvoidingView').props.enabled, true);
  const closed = screen(palettes.darkTheme, 'android', 32, 48, true, '', false, false);
  assert.equal(closed.records.find(x => x.kind === 'KeyboardAvoidingView').props.enabled, false);
  assert.equal(closed.records.find(x => x.kind === 'KeyboardAvoidingView').props.behavior, 'height');
});

test('ios keeps padding avoidance enabled regardless of IME flag', () => {
  for (const imeOpen of [false, true]) {
    const { records } = screen(palettes.lightTheme, 'ios', 44, 34, true, '', false, imeOpen);
    const kav = records.find(x => x.kind === 'KeyboardAvoidingView');
    assert.equal(kav.props.behavior, 'padding');
    assert.equal(kav.props.enabled, true);
    assert.equal(kav.style.paddingTop, 0);
  }
});

test('installed ScrollView release handler retains composer focus with actual Meet list props', () => {
  const source = fs.readFileSync('node_modules/react-native/Libraries/Components/ScrollView/ScrollView.js', 'utf8');
  const start = source.indexOf('  _handleResponderRelease: (e: GestureResponderEvent) => void = (');
  assert.ok(start > 0);
  const end = source.indexOf('\n  };', start) + 5;
  const { code } = babel.transformSync('class Probe {\n' + source.slice(start, end) + '\n}\nexports.Probe=Probe;', {
    filename: 'ScrollView.js', babelrc: false, configFile: false, presets: ['module:@react-native/babel-preset'],
  });
  let blurs = 0;
  const input = {};
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.ok(name.startsWith('@babel/runtime/'));
    return require(name);
  }, __DEV__: false, TextInputState: {
    currentlyFocusedInput: () => input, blurTextInput: () => blurs++,
  }});
  const probe = new exports.Probe();
  probe.props = screen(palettes.darkTheme, 'android', 32, 48).records.find(x => x.kind === 'FlatList').props;
  probe._keyboardIsDismissible = () => true;
  probe._observedScrollSinceBecomingResponder = false;
  probe._becameResponderWhileAnimating = false;
  const release = { nativeEvent: { touches: [] }, target: {} };
  probe._handleResponderRelease(release);
  assert.equal(blurs, 0, 'Meet transcript touch must not blur composer');
  probe.props = { ...probe.props, keyboardShouldPersistTaps: 'handled' };
  probe._handleResponderRelease(release);
  assert.equal(blurs, 1, 'Old handled policy reproduces the empty-transcript dismissal');
});

function installedAndroidKav() {
  const listeners = new Map();
  const View = 'View';
  const KAV = load('node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js', {
    '../../LayoutAnimation/LayoutAnimation': { configureNext() {} },
    '../../StyleSheet/StyleSheet': { compose: (a, b) => [a, b] },
    '../../Utilities/Platform': { OS: 'android' },
    '../AccessibilityInfo/AccessibilityInfo': {}, '../View/View': View,
    './Keyboard': { isVisible: () => false, addListener(name, callback) {
      listeners.set(name, callback); return { remove: () => listeners.delete(name) };
    }},
  }, true).default;
  return { listeners, KAV };
}

test('installed RN Android height avoidance reduces viewport, survives layout, restores and cleans up', async () => {
  const { listeners, KAV } = installedAndroidKav();
  const kav = new KAV({ behavior: 'height', style: { flex: 1, paddingTop: 32 } });
  kav.setState = state => { kav.state = { ...kav.state, ...state }; };
  const layout = height => kav._onLayout({ persist() {}, nativeEvent: { layout: { y: 0, height } } });
  await layout(860);
  kav.componentDidMount();
  listeners.get('keyboardDidShow')({ endCoordinates: { screenY: 520 } });
  await kav._updateBottomIfNecessary();
  assert.equal(flatten(kav.render().props.style).height, 520);
  assert.equal(flatten(kav.render().props.style).paddingTop, 32);
  await layout(520);
  assert.equal(flatten(kav.render().props.style).height, 520, 'No repeated IME subtraction');
  listeners.get('keyboardDidHide')({ endCoordinates: { screenY: 860 } });
  await kav._updateBottomIfNecessary();
  assert.equal(flatten(kav.render().props.style).height, undefined);
  assert.equal(flatten(kav.render().props.style).flex, 1);
  await layout(860);
  // Native adjustResize already shrank the parent before the show event.
  await layout(520);
  listeners.get('keyboardDidShow')({ endCoordinates: { screenY: 520 } });
  await kav._updateBottomIfNecessary();
  assert.equal(kav.state.bottom, 0, 'No additional reduction when native resize already avoided IME');
  assert.equal(flatten(kav.render().props.style).height, undefined);
  kav.componentWillUnmount();
  assert.equal(listeners.size, 0);
});

test('installed RN Android height retains E3.6.5 209px residual after hide with clipped screenY', async () => {
  const { listeners, KAV } = installedAndroidKav();
  // A50 raw geometry: full window 2340; post-dismiss composer rose 209px (screenY 2131).
  const full = 2340;
  const imeTop = 1359;
  const clippedHideY = full - 209;
  const kav = new KAV({ behavior: 'height', enabled: true, style: { flex: 1, paddingTop: 115 } });
  kav.setState = state => { kav.state = { ...kav.state, ...state }; };
  const layout = height => kav._onLayout({ persist() {}, nativeEvent: { layout: { y: 0, height } } });
  await layout(full);
  kav.componentDidMount();
  listeners.get('keyboardDidShow')({ endCoordinates: { screenY: imeTop } });
  await kav._updateBottomIfNecessary();
  assert.equal(flatten(kav.render().props.style).height, imeTop);
  await layout(imeTop);
  listeners.get('keyboardDidHide')({ endCoordinates: { screenY: clippedHideY } });
  await kav._updateBottomIfNecessary();
  assert.equal(kav.state.bottom, 209, 'Hide event with clipped screenY leaves the measured residual');
  assert.equal(flatten(kav.render().props.style).height, full - 209);
  // Meet gates enabled=false after keyboardDidHide so the residual cannot paint.
  kav.props = { ...kav.props, enabled: false };
  const disabled = flatten(kav.render().props.style);
  assert.equal(disabled.height, full, 'Disabling avoidance restores full initial height');
  assert.equal(disabled.flex, 0);
  kav.componentWillUnmount();
  assert.equal(listeners.size, 0);
});

test('installed RN Android height open→dismiss→open cycles clear when remounted after each hide', async () => {
  const full = 2340;
  const imeTop = 1359;
  const clippedHideY = full - 209;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const { listeners, KAV } = installedAndroidKav();
    const kav = new KAV({ behavior: 'height', enabled: true, style: { flex: 1 } });
    kav.setState = state => { kav.state = { ...kav.state, ...state }; };
    const layout = height => kav._onLayout({ persist() {}, nativeEvent: { layout: { y: 0, height } } });
    await layout(full);
    kav.componentDidMount();
    listeners.get('keyboardDidShow')({ endCoordinates: { screenY: imeTop } });
    await kav._updateBottomIfNecessary();
    assert.equal(flatten(kav.render().props.style).height, imeTop, `cycle ${cycle} open`);
    await layout(imeTop);
    listeners.get('keyboardDidHide')({ endCoordinates: { screenY: clippedHideY } });
    await kav._updateBottomIfNecessary();
    assert.equal(kav.state.bottom, 209, `cycle ${cycle} residual before Meet remount`);
    kav.props = { ...kav.props, enabled: false };
    assert.equal(flatten(kav.render().props.style).height, full, `cycle ${cycle} gated restore`);
    kav.componentWillUnmount();
    assert.equal(listeners.size, 0, `cycle ${cycle} cleanup`);
  }
});
