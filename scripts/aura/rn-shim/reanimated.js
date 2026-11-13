/** Reanimated stand-in: Easing is used at module scope by theme/motion.ts. */
const identity = (t) => t;

/**
 * A layout-animation descriptor stub.
 *
 * `FadeIn.delay(220).duration(260)` must chain, and the result is handed to React
 * as a prop. Under `react-dom` every prop is stringified, so the descriptor needs a
 * real primitive representation — a Proxy that answers every property with a
 * function makes coercion throw "Cannot convert object to primitive value".
 */
function chainable() {
  const node = {
    delay: () => node,
    duration: () => node,
    withInitialValues: () => node,
    springify: () => node,
    damping: () => node,
    stiffness: () => node,
    build: () => ({}),
    toString: () => '[animation]',
    valueOf: () => '[animation]',
    [Symbol.toPrimitive]: () => '[animation]',
  };
  return node;
}

const Easing = {
  bezier: () => identity,
  linear: identity,
  ease: identity,
  inOut: (f) => f,
  out: (f) => f,
  in: (f) => f,
};
module.exports = {
  Easing,
  useReducedMotion: () => false,
  useSharedValue: (v) => ({ value: v }),
  useAnimatedStyle: (f) => f(),
  withTiming: (v) => v,
  withSpring: (v) => v,
  withDelay: (_d, v) => v,
  withSequence: (...v) => v[v.length - 1],
  runOnJS: (f) => f,
  cancelAnimation: () => {},
  /*
   * Layout-animation descriptors are chainable in Reanimated
   * (`FadeIn.delay(220).duration(260)`), and the probe builds them outside a native
   * runtime. Each call returns the same chainable stub so module-level or inline
   * construction cannot throw. Entrance animation itself is not verified — this is
   * a static markup probe.
   */
  FadeIn: chainable(),
  FadeOut: chainable(),
  SlideInDown: {},
  /*
   * `Animated.View` / `Animated.Text` must be *components*, not callbacks. The
   * previous stub exposed `View: React.createElement`, so `<Animated.View>` was a
   * function returning an element — React treats that as an invalid child and the
   * whole tree fails. Animations are not exercised here; the element just has to
   * mount.
   */
  /*
   * `Animated.View` must resolve under BOTH interop shapes. esbuild treats this
   * CommonJS module's default import as the whole `module.exports` object (there is
   * no `__esModule` marker), so `Animated.View` looks at the top level — while a
   * transpiled `import Animated from` under Babel would look at `.default`. Both
   * are provided so the probe cannot fail for a packaging reason unrelated to the
   * component under test.
   */
  createAnimatedComponent: (c) => c,
  View: require('./react-native.js').View,
  Text: require('./react-native.js').Text,
  Image: require('./react-native.js').Image,
  ScrollView: require('./react-native.js').ScrollView,
};
