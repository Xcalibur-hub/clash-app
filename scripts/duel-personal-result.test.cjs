/* DuelPersonalResult — caller-scoped recorded-result rendering.
 *
 * Reuses the duel-render-smoke harness conventions: React Native primitives
 * through react-native-web, services stubbed at their module boundary (effects
 * never run in a static render). This proves presentation only; it is not
 * device acceptance and asserts no network behaviour. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const test = require('node:test');
const babel = require('@babel/core');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (mod, filename) => {
    const out = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    mod._compile(out.code, filename);
  };
}

const originalLoad = Module._load;
let owner = 'account-1';
let theme;
const offline = async () => { throw Error('Effects must not run in a static render'); };
Module._load = function (request, parent, isMain) {
  // Native primitives are bridged to react-native-web for this static render.
  if (request === 'react-native') return { ...RN, useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }) };
  // Reanimated resolves through ESM only; the component needs no animation.
  if (request === 'react-native-reanimated') {
    const fade = { duration() { return this; } };
    return {
      __esModule: true,
      default: { View: RN.View, Text: RN.Text, createAnimatedComponent: (c) => c },
      FadeIn: fade, FadeInDown: fade, FadeOut: fade, ZoomIn: fade, SlideInLeft: fade, SlideInRight: fade,
      Extrapolation: { CLAMP: 'clamp' },
      Easing: { bezier: () => ({}), inOut: (e) => e, out: (e) => e, sin: {}, quad: {}, cubic: {}, back: () => ({}) },
      useReducedMotion: () => true,
      useSharedValue: (v) => ({ value: v }),
      useAnimatedStyle: (style) => style(),
      interpolate: () => 0,
      withRepeat: (v) => v, withTiming: (v) => v, withDelay: (_d, v) => v, withSpring: (v) => v, withSequence: (...v) => v[0],
      runOnJS: (fn) => fn,
    };
  }
  const resolved = Module._resolveFilename(request, parent).replaceAll('\\', '/');
  // Signed-in owner is configurable so the null-owner path can be exercised.
  if (resolved.endsWith('/store/AuthProvider.tsx')) return { useAuth: () => ({ user: owner ? { id: owner } : null }) };
  if (resolved.endsWith('/services/supabaseClient.ts')) return { currentUserId: offline };
  if (resolved.endsWith('/services/apiService.ts')) return { currentViewerProfileId: offline };
  if (resolved.endsWith('/services/clashEngineService.ts')) return { fetchClashView: offline, fetchReputationEvents: offline };
  if (theme && resolved === `${root.replaceAll('\\', '/')}/theme/index.ts`) return theme;
  return originalLoad.apply(this, arguments);
};
// Loaded after the hook, so `as const` in theme modules compiles.
theme = { ...require('../theme/layout.ts'), ...require('../theme/typography.ts'), ...require('../theme/colors.ts'), ...require('../theme/motion.ts') };
const { darkTheme } = require('../theme/palettes.ts');
theme.useThemeColors = () => darkTheme;

const { DuelPersonalResult } = require('../components/liveArena/DuelPersonalResult.tsx');

const render = () => renderToStaticMarkup(React.createElement(DuelPersonalResult, { clashId: 'clash-1' }));

test('renders nothing when signed out', () => {
  owner = null;
  assert.equal(render(), '');
  owner = 'account-1';
});

test('shows a truthful loading state before any read resolves', () => {
  const html = render();
  assert.match(html, /Your recorded result/);
  assert.match(html, /Loading your recorded result/);
});

test('never invents a verdict, ballot, reputation or coin figure while loading', () => {
  const html = render();
  // No authoritative value has been read, so none may appear.
  assert.doesNotMatch(html, /Your ballot:/);
  assert.doesNotMatch(html, /Reputation:/);
  assert.doesNotMatch(html, /Coins:/);
  assert.doesNotMatch(html, /\+?\d+\s*(XP|coins)/i);
});

test('does not show a retry affordance until a read has actually failed', () => {
  assert.doesNotMatch(render(), /Retry/);
});

test('exposes a header role for the section title', () => {
  assert.match(render(), /role="heading"|accessibilityRole="header"/);
});

test('does not render any outcome claim in the pre-read state', () => {
  const html = render();
  assert.doesNotMatch(html, /WIN|LOSS|DRAW|VICTORY|DEFEAT/i);
});
