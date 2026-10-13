/* Render + interaction test for the Explore Search Hub (step S1).
 *
 * Uses the same Node-side bridge as scripts/duel-render-smoke.cjs: TypeScript/JSX is transformed
 * with the repo's existing Babel dev dependencies, React Native primitives are served by
 * react-native-web, and native-only modules are bridged. It renders the REAL component — no
 * reimplementation — and asserts both the markup and the handlers the component wires.
 *
 * This is not a substitute for device testing: no layout, gesture or native behaviour is asserted.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const babel = require('@babel/core');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..').replaceAll('\\', '/');
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (mod, filename) => {
    const out = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    mod._compile(out.code, filename);
  };
}

/** Captured handler props and router calls — this is how interaction is asserted without a DOM. */
const pressables = [];
const pushed = [];
const routerStub = { push: (href) => pushed.push(String(href)) };
const noop = () => {};
const fade = { duration() { return this; } };
let theme;

const Bridge = {
  ...RN,
  Pressable: (props) => {
    pressables.push(props);
    return React.createElement(RN.Pressable, props, props.children);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return Bridge;
  if (request === 'expo-router') return { useRouter: () => routerStub, router: routerStub };
  if (request === 'expo-linear-gradient') {
    return { LinearGradient: ({ children, style }) => React.createElement(RN.View, { style }, children) };
  }
  if (request === 'react-native-reanimated') {
    return {
      __esModule: true,
      default: { View: RN.View, Text: RN.Text, createAnimatedComponent: (c) => c },
      FadeIn: fade, FadeInDown: fade, FadeOut: fade,
      useReducedMotion: () => true,
      useSharedValue: (v) => ({ value: v }),
      useAnimatedStyle: () => ({}),
      withTiming: (v) => v, interpolate: () => 0, runOnJS: (fn) => fn,
    };
  }
  const resolved = Module._resolveFilename(request, parent).replaceAll('\\', '/');
  if (resolved === `${root}/theme/index.ts`) return theme;
  if (resolved.endsWith('/utils/haptics.ts')) return { tap: noop, press: noop, judge: noop, notify: noop };
  return originalLoad.apply(this, arguments);
};

theme = { ...require('../theme/layout.ts'), ...require('../theme/typography.ts'), ...require('../theme/colors.ts') };
theme.useThemeColors = () => require('../theme/palettes.ts').darkTheme;

const { SearchHub } = require('../components/explore/SearchHub.tsx');
const { EXPLORE_SEARCH_GROUPS } = require('../utils/exploreForYouRank.ts');

/** Fixtures mirror exactly the fields the component reads for each section. */
const RESULTS = {
  countries: [{ countryCode: 'IN', name: 'India' }, { countryCode: 'BR', name: 'Brazil' }],
  takes: [
    { id: 't1', text: 'Take with media', authorHandle: 'sam', mediaUrl: 'https://cdn.example/x.jpg' },
    { id: 't2', text: 'Text only take', authorHandle: 'kim', mediaUrl: null },
  ],
  people: [{ id: 'p1', name: 'Sam', handle: 'sam', avatarTint: '#a1a1aa' }],
  topics: [{ id: 'tp1', title: 'Live topic', status: 'LIVE' }],
  vault: [{ dropId: 'd1', title: 'Preview drop', creatorHandle: 'kim', mediaUrl: null, accessLevel: 'preview' }],
  hoods: [{ hood: 'h1', label: 'Hood One' }],
};

/** Renders SearchHub with real props and returns the markup plus the handlers it wired. */
function render({ group = 'top', onGroup = noop, onCountry = noop } = {}) {
  pressables.length = 0;
  const html = renderToStaticMarkup(
    React.createElement(SearchHub, { results: RESULTS, group, onGroup, onCountry }),
  );
  return { html, handlers: pressables.slice(), rows: [...pressables] };
}

/** Text content of a captured pressable, rendered independently so it can be matched on. */
function label(pressable) {
  try {
    return renderToStaticMarkup(React.createElement(RN.View, null, pressable.children));
  } catch {
    return '';
  }
}

/** Finds the first captured pressable whose rendered text contains `needle`. */
function pressByText(handlers, needle) {
  const found = handlers.find((p) => label(p).includes(needle));
  assert.ok(found, `no pressable rendered text containing ${JSON.stringify(needle)}`);
  return found;
}

/** Finds a pressable that contains `needle` but not `exclude` — disambiguates repeated text. */
function pressByTextExcluding(handlers, needle, exclude) {
  const found = handlers.find((p) => {
    const text = label(p);
    return text.includes(needle) && !text.includes(exclude);
  });
  assert.ok(found, `no pressable containing ${JSON.stringify(needle)} without ${JSON.stringify(exclude)}`);
  return found;
}

const ALL_GROUP_LABELS = EXPLORE_SEARCH_GROUPS.map((g) => g.label);

test('renders every group chip and every section for the Top group', () => {
  const { html, handlers } = render({ group: 'top' });
  for (const g of EXPLORE_SEARCH_GROUPS) {
    assert.ok(html.includes(g.label), `chip label ${g.label} missing from the render`);
  }
  for (const needle of ['India', 'Brazil', 'Take with media', 'Live topic', 'Preview drop', 'Hood One', '@sam']) {
    assert.ok(html.includes(needle), `section content ${JSON.stringify(needle)} missing when group=top`);
  }
  const chips = handlers.filter((p) => p.accessibilityRole === 'button' && ALL_GROUP_LABELS.includes(p.accessibilityLabel));
  assert.equal(chips.length, EXPLORE_SEARCH_GROUPS.length, 'one chip per search group');
  assert.deepEqual(chips.map((c) => c.accessibilityLabel), ALL_GROUP_LABELS, 'chip order and labels are unchanged');
  const selected = chips.filter((c) => c.accessibilityState?.selected === true);
  assert.equal(selected.length, 1, 'exactly one chip is marked selected');
  assert.equal(selected[0].accessibilityLabel, 'Top');
});

test('group switching invokes onGroup with each group id', () => {
  for (const g of EXPLORE_SEARCH_GROUPS) {
    const seen = [];
    const { handlers } = render({ group: g.id, onGroup: (id) => seen.push(id) });
    const chip = handlers.find((p) => p.accessibilityLabel === g.label);
    assert.ok(chip, `chip ${g.label} missing when group=${g.id}`);
    assert.equal(chip.accessibilityRole, 'button');
    assert.equal(chip.accessibilityState?.selected, true, `${g.label} must render as selected when group=${g.id}`);
    chip.onPress();
    assert.deepEqual(seen, [g.id], `pressing ${g.label} must request group ${g.id}`);
  }
});

test('each group renders only its own sections', () => {
  const has = (group, needle) => render({ group }).html.includes(needle);
  assert.ok(has('countries', 'India'), 'countries group shows countries');
  assert.ok(!has('countries', 'Take with media') && !has('countries', 'Hood One'), 'countries group hides other sections');

  assert.ok(has('media', 'Take with media'), 'media group shows takes with media');
  assert.ok(!has('media', 'Text only take'), 'media group filters out takes without mediaUrl');

  assert.ok(has('people', '@sam'), 'people group shows the person card');
  assert.ok(!has('people', 'India'), 'people group hides countries');

  assert.ok(has('arena', 'Live topic'), 'arena group shows live topics');
  assert.ok(has('vault', 'Preview drop'), 'vault group shows the vault rail');
  assert.ok(has('hoods', 'Hood One') && !has('hoods', 'Take with media'), 'hoods group shows hoods only');
});

test('country selection invokes onCountry with the country code', () => {
  const seen = [];
  const { handlers } = render({ group: 'countries', onCountry: (code) => seen.push(code) });
  pressByText(handlers, 'India').onPress();
  pressByText(handlers, 'Brazil').onPress();
  assert.deepEqual(seen, ['IN', 'BR']);
});

test('navigation targets are preserved for takes, people, topics and vault drops', () => {
  pushed.length = 0;
  const { handlers } = render({ group: 'top' });
  pressByText(handlers, 'Take with media').onPress();
  pressByTextExcluding(handlers, '@sam', 'Take with media').onPress();
  pressByText(handlers, 'Live topic').onPress();
  pressByText(handlers, 'Preview drop').onPress();
  assert.deepEqual(pushed, ['/take/t1', '/profile/p1', '/arena/topic/tp1', '/vault/drop/d1']);
});

test('renders the chip row only when every result list is empty', () => {
  const empty = { countries: [], takes: [], people: [], topics: [], vault: [], hoods: [] };
  const html = renderToStaticMarkup(
    React.createElement(SearchHub, { results: empty, group: 'top', onGroup: noop, onCountry: noop }),
  );
  for (const g of EXPLORE_SEARCH_GROUPS) {
    assert.ok(html.includes(g.label), `chips must still render when there is nothing to show`);
  }
  for (const needle of ['India', 'Take with media', 'Live topic', 'Preview drop', 'Hood One']) {
    assert.ok(!html.includes(needle), `${JSON.stringify(needle)} must not render for empty results`);
  }
});
