/* Render the actual duel components with React Native Web primitives. Native
 * animation/media modules are bridged for this Node smoke check; this is not a
 * substitute for device testing. Uses only existing dev dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
for (const ext of ['.ts','.tsx']) Module._extensions[ext] = (mod, filename) => {
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  mod._compile(transformed.code, filename);
};
const originalLoad = Module._load;
let theme;
const noop = () => {};
const fade = { duration() { return this; } };
Module._load = function(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ...RN,
      Modal: ({ children, visible }) => (visible ? React.createElement(RN.View, null, children) : null),
    };
  }
  if (request === 'react-native-svg') return originalLoad.call(this, 'react-native-svg/lib/commonjs/ReactNativeSVG.web.js', parent, isMain);
  if (request === 'react-native-reanimated') return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: (c) => c },
    FadeIn: fade, FadeInDown: fade, FadeOut: fade, ZoomIn: fade, SlideInLeft: fade, SlideInRight: fade,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: { inOut: (e) => e, out: (e) => e, sin: {}, quad: {}, cubic: {}, back: () => ({}) },
    useReducedMotion: () => true,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    interpolate: () => 0,
    withRepeat: (v) => v, withTiming: (v) => v, withDelay: (_d, v) => v, withSpring: (v) => v, withSequence: (...v) => v[0],
    runOnJS: (fn) => fn,
  };
  if (request === 'react-native-gesture-handler') {
    const passthrough = ({ children }) => children ?? null;
    return {
      GestureDetector: passthrough,
      Gesture: {
        Pan: () => ({
          enabled() { return this; },
          activeOffsetX() { return this; },
          failOffsetY() { return this; },
          onBegin() { return this; },
          onUpdate() { return this; },
          onEnd() { return this; },
        }),
      },
    };
  }
  if (request === 'expo-linear-gradient') return { LinearGradient: ({ children, style }) => React.createElement(RN.View, { style }, children) };
  if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
  const resolved = Module._resolveFilename(request, parent).replaceAll('\\','/');
  if (resolved.endsWith('/hooks/useArenaCrowd.ts')) return { useArenaCrowd: () => ({ messages: [],context: null,loading: true,error: null,connected: false,sending: false,hasOlder: false,olderBusy: false,refresh: async () => {},loadOlder: async () => {},send: async () => false }) };
  if (theme && resolved === `${root.replaceAll('\\','/')}/theme/index.ts`) return theme;
  if (resolved.endsWith('/utils/haptics.ts')) return { tap: noop, press: noop, judge: noop, notify: noop };
  if (/\/components\/shared\/icons\.tsx?$/.test(resolved) || resolved.includes('/components/shared/icons/')) return new Proxy({}, { get: (_, name) => name === '__esModule' ? false : props => React.createElement(RN.Text, { style: { color: props.color, fontSize: props.size } }, name === 'BackIcon' ? '‹' : '···') });
  if (resolved.endsWith('/components/arena/CommentMedia.tsx')) return { CommentMedia: () => React.createElement(RN.Text, {}, 'Media attachment') };
  if (resolved.endsWith('/components/arena/ClashNativeStickerCard.tsx')) return { ClashNativeStickerCard: () => React.createElement(RN.Text, {}, 'Sticker') };
  return originalLoad.apply(this, arguments);
};
theme = { ...require('../theme/layout.ts'), ...require('../theme/typography.ts'), ...require('../theme/colors.ts') };
const { darkTheme } = require('../theme/palettes.ts');
theme.useThemeColors = () => darkTheme;
const { DuelRoomExperience } = require('../components/liveArena/DuelRoomExperience.tsx');
const now = Date.UTC(2026,9,7,12,30);
const fighterA = { id: 'a', name: 'Kevin', handle: 'kevin', tint: '#a1a1aa' };
const fighterB = { id: 'b', name: 'Rohan', handle: 'rohan', tint: '#a1a1aa' };
const duel = { clashId: 'cl', status: 'open', fighterA, fighterB, viewerRelationship: 'spectator', mayJudge: false, hasJudged: false, verdict: null,
  sourceText: 'AI will replace most junior programmers.', counterPosition: 'Companies will still need juniors to validate and integrate generated code.' };
const message = (id, author, body, time) => ({ id, roomId: 'r', kind: 'text', body, parentMessageId: null, createdAt: time,
  author: { ...author, avatarTint: author.tint, rank: 'Rookie' }, mediaUrl: null, mediaKind: null, gifProvider: null, gifExternalId: null,
  isOwn: false, reactions: [], replyCount: 0, argumentVotes: null });
const room = { roomMode: 'DUEL', clashId: 'cl', duel, roomId: 'r', topicId: 't', status: 'OPEN', phase: 'open',
  topic: { title: duel.sourceText }, viewer: { role: 'spectator' }, result: { winningSide: 'AGREE', agreeVotes: 999 } };
const base = { room, messages: [message('a1',fighterA,'Automation is already handling routine coding tasks.',now), message('b1',fighterB,'But integration, validation and judgement still need people.',now+12000)],
  evidence: [], paddingTop: 12, paddingBottom: 12, spectatorCount: null, loading: false, refreshing: false, loadingOlder: false, hasOlder: false,
  threadLocked: false, error: null, composer: React.createElement(RN.Text, {}, 'Fighter composer'), onBack: noop, onReturn: noop,
  onRefresh: async () => {}, onLoadOlder: async () => {}, onJudge: async () => {}, onWatch: async () => {}, onOpenProfile: noop, onReply: noop, onReport: noop };
const scenarios = {
  spectator: {},
  fighter: { room: { ...room, duel: { ...duel, viewerRelationship: 'fighter_a' }, viewer: { role: 'debater' } } },
  judging: { room: { ...room, phase: 'judging', status: 'JUDGING', duel: { ...duel, mayJudge: true } } },
  draw: { room: { ...room, phase: 'closed', status: 'SETTLED', duel: { ...duel, status: 'settled', verdict: { winnerSide: 'DRAW', verdictLabel: 'DRAW', jurySize: 4, sideAScore: 2, sideBScore: 2 } } } },
  cancelled: { room: { ...room, phase: 'closed', status: 'CANCELLED', duel: { ...duel, status: 'cancelled' } } },
  error: { messages: [], error: 'permission denied for table arena_room_messages' },
  loading: { messages: [], loading: true },
  locked: { threadLocked: true },
  'historical-locked': { threadLocked: true, room: { ...room, phase: 'closed', status: 'SETTLED', duel: { ...duel, status: 'settled', verdict: { winnerSide: 'A', verdictLabel: 'SPLIT DECISION', jurySize: 1 } } } },
  'cancelled-locked': { threadLocked: true, room: { ...room, phase: 'closed', status: 'CANCELLED', duel: { ...duel, status: 'cancelled' } } },
  'settlement-pending': { room: { ...room, phase: 'closed', status: 'JUDGING', duel: { ...duel, hasJudged: true } } },
  moderated: { messages: [base.messages[1]], evidence: [{ id: 'hidden', author: base.messages[0].author, messageId: 'a1', title: 'SECRET HIDDEN CITATION', createdAt: now, roomId: 'r', topicId: 't', kind: 'link' }] },
};
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
for (const [name, overrides] of Object.entries(scenarios)) {
  RN.AppRegistry.registerComponent(name, () => () => React.createElement(RN.View, { style: { height: 844, width: 390 } }, React.createElement(DuelRoomExperience, { ...base, ...overrides })));
  const { element, getStyleElement } = RN.AppRegistry.getApplication(name);
  const html = renderToStaticMarkup(element);
  assert.doesNotMatch(html, /SECRET HIDDEN CITATION|permission denied for table|999/);
  // Stadium: no permanent Arguments|Crowd|Evidence tab bar.
  assert.doesNotMatch(html, /Clash content/);
  if (name !== 'error' && name !== 'loading' && !name.includes('locked')) {
    assert.match(html, /Kevin/);
    assert.match(html, /Rohan/);
  }
  if (name === 'spectator') {
    assert.match(html, /LIVE|Live Clash/);
    assert.match(html, /CROWD|Live crowd|Crowd/);
    assert.match(html, /BACK KEVIN|Back Kevin|BACKING/i);
    assert.doesNotMatch(html, /Reply to this argument|Fighter composer|Live Chat|52%|48%/);
    assert.doesNotMatch(html, /Backing supports a side during the Clash/);
    // Newest moment owns the Stage (Alex/Rohan posted last in fixture).
    assert.match(html, /integration, validation and judgement still need people/);
    assert.match(html, /— Rohan|Rohan/);
  }
  if (name === 'fighter') {
    assert.match(html, /FIGHTER A|Fighter A|YOU'RE FIGHTING/);
    assert.match(html, /Fighter composer/);
  }
  if (name === 'judging') assert.match(html, /Judge Kevin, Fighter A, made the stronger case/);
  if (name === 'draw') { assert.match(html, /Draw|VERDICT/); assert.match(html, /50%/); assert.match(html, /4 judgment/); }
  if (name === 'cancelled') {
    assert.match(html, /Clash cancelled/);
    assert.match(html, /Crowd chat is unavailable because this Clash was cancelled/);
    assert.doesNotMatch(html, /Send public Crowd message/);
  }
  if (name === 'error') assert.match(html, /Couldn&#x27;t load the Clash/);
  if (name === 'loading') assert.match(html, /Loading Clash transcript/);
  if (name === 'locked') { assert.match(html, /Watch this Clash as a spectator/); assert.doesNotMatch(html, /Automation is already/); }
  if (name === 'historical-locked') { assert.match(html,/Watch this Clash as a spectator|read-only/); assert.match(html,/historical Stage/); assert.doesNotMatch(html,/Automation is already|Fighter composer/); }
  if (name === 'cancelled-locked') { assert.doesNotMatch(html,/Watch this Clash as a spectator|Send public Crowd message|Fighter composer/); }
  if (name === 'settlement-pending') { assert.match(html,/Settlement pending/); assert.match(html,/not completed settlement/); assert.doesNotMatch(html,/Judge Kevin, Fighter A|Fighter composer/); }
  if (name === 'moderated') assert.doesNotMatch(html, /Automation is already/);
  if (out) fs.writeFileSync(path.join(out, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${renderToStaticMarkup(getStyleElement())}<style>html,body{margin:0;background:#09090b;height:100%}*{font-family:Arial,sans-serif!important}</style></head><body>${html}</body></html>`);
  process.stdout.write(`PASS ${name}\n`);
}

// Full-screen Challenge + confirmed + entrance smoke (presentation only).
const { FullScreenChallengeDeck } = require('../components/arena/FullScreenChallengeDeck.tsx');
const { ClashConfirmedOverlay } = require('../components/arena/ClashConfirmedOverlay.tsx');
const { CrowdShell } = require('../components/liveArena/CrowdShell.tsx');
const { ArenaEntrance } = require('../components/liveArena/ArenaEntrance.tsx');
const { DuelEntrance } = require('../components/liveArena/DuelEntrance.tsx');
const {
  consumeArenaEntrance, peekArenaEntrancePending, requestArenaEntrance, resetArenaEntranceForTests,
} = require('../utils/arenaEntranceState.ts');
const challenge = {
  id: 'ch1', takeId: 't1', challengerId: 'b', challengedId: 'a',
  counterPosition: 'Companies will still need juniors to validate and integrate generated code.',
  status: 'PENDING', createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(), resolvedAt: null,
  clashId: null, roomId: null, created: true,
  challenger: { id: 'b', name: 'Rohan', handle: 'rohan' },
};
const challengeCases = {
  'challenge-fullscreen': React.createElement(FullScreenChallengeDeck, {
    visible: true,
    challenges: [challenge, { ...challenge, id: 'ch2', challenger: { id: 'c', name: 'Maya', handle: 'maya' } }],
    takeText: 'AI will replace most junior programmers.',
    onClose: noop,
    onAccept: async () => {},
    onPass: async () => {},
  }),
  'challenge-confirmed': React.createElement(ClashConfirmedOverlay, {
    visible: true,
    fighterA: { name: 'Kevin', handle: 'kevin' },
    fighterB: { name: 'Rohan', handle: 'rohan' },
  }),
  'crowd-shell': React.createElement(CrowdShell, {}),
  'arena-entrance': React.createElement(ArenaEntrance, { active: true, onDone: noop }),
  'duel-entrance': React.createElement(DuelEntrance, {
    active: true, onDone: noop, proposition: duel.sourceText, duel,
  }),
};
for (const [name, element] of Object.entries(challengeCases)) {
  const html = renderToStaticMarkup(React.createElement(RN.View, { style: { width: 390, minHeight: 780 } }, element));
  if (name === 'challenge-fullscreen') {
    assert.match(html, /Rohan/);
    assert.match(html, /ACCEPT/);
    assert.match(html, /PASS/);
    assert.match(html, /CHALLENGE/);
    assert.match(html, /THEIR TAKE|YOUR TAKE/);
    assert.match(html, /2 PENDING|PENDING/);
  }
  if (name === 'challenge-confirmed') assert.match(html, /CONFIRMED|ENTERING ARENA/);
  if (name === 'crowd-shell') {
    assert.match(html, /Crowd|CROWD/);
    assert.doesNotMatch(html, /Send|Post a message|Compose/);
    assert.doesNotMatch(html, /nah that actually changed my mind/);
    assert.doesNotMatch(html, /DEV LAYOUT/);
  }
  if (name === 'arena-entrance') assert.match(html, /ARENA/);
  if (name === 'duel-entrance') assert.match(html, /ENTERING ARENA|Kevin|Rohan/);
  if (out) fs.writeFileSync(path.join(out, `${name}.html`), `<!doctype html><html><body>${html}</body></html>`);
  process.stdout.write(`PASS ${name}\n`);
}
resetArenaEntranceForTests();
assert.equal(consumeArenaEntrance(), true);
assert.equal(consumeArenaEntrance(), false);
requestArenaEntrance();
assert.equal(peekArenaEntrancePending(), true);
assert.equal(consumeArenaEntrance(), true);
process.stdout.write('PASS arena-entrance-gate\n');
const { LiveCrowdLayer } = require('../components/liveArena/LiveCrowdLayer.tsx');
const crowdBase = { messages: [],context: { roomId:'r',canSend:true,spectatorCount:2,serverNow:new Date().toISOString(),closesAt:new Date().toISOString() },loading:false,error:null,connected:true,sending:false,hasOlder:false,olderBusy:false,refresh:async()=>{},loadOlder:async()=>{},send:async()=>true };
for(const [name,crowd] of Object.entries({
  'crowd-live': {...crowdBase,messages:[{id:'00000000-0000-0000-0000-000000000001',roomId:'r',body:'A genuine server-provided Crowd row',createdAt:new Date().toISOString(),isOwn:false,author:{id:'s',name:'Sam',handle:'sam',avatarTint:'#aaaaaa'}}]},
  'crowd-loading': {...crowdBase,context:null,loading:true},
  'crowd-error': {...crowdBase,error:'Crowd could not update. Try again.'},
  'crowd-closed': {...crowdBase,context:{...crowdBase.context,canSend:false}},
})) {
  const html = renderToStaticMarkup(React.createElement(LiveCrowdLayer,{crowd,onReport:noop}));
  assert.doesNotMatch(html,/DEV LAYOUT|Spectator posting isn|nah that actually changed/);
  if(name==='crowd-live') { assert.match(html,/server-provided Crowd row/); assert.match(html,/Send public Crowd message/); assert.match(html,/Report or block/); }
  if(name==='crowd-loading') assert.match(html,/Loading Crowd/);
  if(name==='crowd-error') assert.match(html,/Retry/);
  if(name==='crowd-closed') { assert.match(html,/read-only/); assert.doesNotMatch(html,/Send public Crowd message/); }
  process.stdout.write(`PASS ${name}\n`);
}
process.stdout.write('22/22 component render scenarios passed. Native media and animation are bridged; no device interaction asserted.\n');
