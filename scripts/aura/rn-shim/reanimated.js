/** Reanimated stand-in: Easing is used at module scope by theme/motion.ts. */
const identity = (t) => t;
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
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  SlideInDown: {},
  default: { createAnimatedComponent: (c) => c, View: require('react').createElement },
};
