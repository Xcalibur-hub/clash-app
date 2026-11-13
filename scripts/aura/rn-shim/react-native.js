/**
 * Minimal React Native surface for the AURA render check.
 *
 * WHY THIS EXISTS
 * ---------------
 * `react-native` ships Flow-typed sources that Node cannot execute, and there is
 * no emulator or headless browser in this environment. So that component logic
 * is still *executed* rather than only type-checked, this shim implements the
 * small surface the AURA primitives use (View/Text/Pressable/StyleSheet) as
 * plain objects.
 *
 * WHAT THIS PROVES
 *   · components render without throwing
 *   · the tree shape is correct (nesting, roles, labels)
 *   · `allowFontScaling` reaches the native node with the intended value
 *   · theme tokens resolve into concrete colours per scheme
 *
 * WHAT THIS DOES NOT PROVE
 *   · layout, measurement, text wrapping, clipping, or pixel appearance
 *   · anything native-only (fonts, shadows, blur, gestures)
 * Never cite this as a screenshot or a layout verification.
 */
const React = require('react');

const el = (name) => {
  const C = React.forwardRef(function Shim(props, ref) {
    return React.createElement(name, { ...props, ref });
  });
  C.displayName = name;
  return C;
};

const StyleSheet = {
  create: (o) => o,
  flatten: (s) => {
    if (!s) return {};
    if (Array.isArray(s)) return Object.assign({}, ...s.map(StyleSheet.flatten));
    return s;
  },
  hairlineWidth: 1,
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

module.exports = {
  View: el('View'),
  Text: el('Text'),
  /**
   * Pressable accepts a *function* for `style` (`({pressed}) => style`). RN
   * resolves it at render; the naive `el('Pressable')` passed the function
   * straight to the DOM, which threw. Resolving it with `pressed: false` is the
   * correct static equivalent — it yields the resting style, which is what a
   * markup probe wants anyway (it cannot simulate a press).
   */
  Pressable: React.forwardRef(function Pressable(props, ref) {
    const { style, ...rest } = props;
    const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement('Pressable', { ...rest, style: resolved, ref });
  }),
  ScrollView: el('ScrollView'),
  Image: el('Image'),
  ActivityIndicator: el('ActivityIndicator'),
  StyleSheet,
  Platform: { OS: 'android', select: (o) => o.android ?? o.default },
  useColorScheme: () => 'dark',
  Appearance: { setColorScheme: () => {} },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  PixelRatio: { get: () => 2, roundToNearestPixel: (n) => n },
  // Some transitive polyfills touch NativeModules at import time.
  NativeModules: { BlobModule: { getConstants: () => ({ BLOB_URI_SCHEME: 'content', BLOB_URI_HOST: null }) }, FileReaderModule: { getConstants: () => ({}) } },
  NativeEventEmitter: class { addListener() { return { remove() {} }; } removeAllListeners() {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  AppRegistry: { registerComponent: () => {}, registerRunnable: () => {}, runApplication: () => {} },
  DeviceEventEmitter: { addListener: () => ({ remove() {} }), removeAllListeners() {} },
};
