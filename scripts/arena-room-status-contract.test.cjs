'use strict';
/**
 * Composed contract & preview regression suite:
 * - Production Room parser (services/liveArenaService.ts) -> Hermes fetchLiveRoomState -> verifySettledVerdictUi
 * - Development-only ?stage=settled preview fixture, normalizer, and route gating
 */
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WebSocketServer } = require('ws');
const { harness } = require('./ui-completion-harness.cjs');
const cdp = require('./lib/arena-hermes-cdp.cjs');
const liveDevices = require('./lib/arena-live-devices.cjs');
const settledGuard = require('./lib/arena-settled-verdict-guard.cjs');

const ROOM_ID = 'ar_composed_990011';
const CLASH_ID = 'cl_composed_990011';
const TOPIC = 'Composed Room contract: Clear evidence beats volume.';
const PNG_OK = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]), Buffer.from('IHDR'),
  Buffer.from([0x00, 0x00, 0x04, 0x38, 0x00, 0x00, 0x09, 0x24, 0x08, 0x02, 0x00, 0x00, 0x00, 0, 0, 0, 0]),
  Buffer.from([0x00, 0x00, 0x00, 0x04]), Buffer.from('IDAT'), Buffer.from([0x78, 0x9c, 0x03, 0, 0, 0, 0, 1]),
  Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82]),
]);

function makeRpcPayload(overrides = {}) {
  const { duel: duelOverrides = {}, ...roomOverrides } = overrides;
  const roomId = roomOverrides.roomId || ROOM_ID;
  const clashId = roomOverrides.clashId || CLASH_ID;
  return {
    roomId, topicId: 'at_1', roomMode: 'DUEL', clashId,
    status: 'SETTLED', phase: 'closed',
    capacity: 50, participantCount: 4,
    opensAt: '2026-11-10T09:00:00Z', closesAt: '2026-11-10T09:30:00Z', createdAt: '2026-11-10T09:00:00Z',
    secondsRemaining: 0, secondsToFinalArguments: 0, secondsToJudging: 0,
    topic: {
      id: 'at_1', title: TOPIC, hood: 'techtakes', status: 'closed',
      opensAt: '2026-11-10T09:00:00Z', finalArgumentsAt: '2026-11-10T09:20:00Z',
      judgingAt: '2026-11-10T09:25:00Z', closesAt: '2026-11-10T09:30:00Z',
    },
    ...roomOverrides,
    duel: {
      clashId, roomId, status: 'settled', viewerRelationship: 'spectator',
      mayJudge: false, hasJudged: true, sideAText: TOPIC, sideBText: 'Volume shows consensus.',
      fighterA: { id: 'u_a', name: 'Kevin', handle: 'kevin' },
      fighterB: { id: 'u_b', name: 'Elena', handle: 'elena' },
      verdict: { winnerSide: 'DRAW', jurySize: 2, verdictLabel: 'Draw', sideAScore: 1, sideBScore: 1 },
      ...duelOverrides,
    },
  };
}

function settledUiXml({
  roomId = ROOM_ID, clashId = CLASH_ID, duelStatus = 'settled',
  winner = 'Official winner: DRAW', tally = 'Community verdict · 2 ballots · A 1 · B 1',
  aShare = 'Kevin, Fighter A, 50% of the panel', bShare = 'Elena, Fighter B, 50% of the panel',
  omitIdentity = false,
} = {}) {
  const outerAttrs = omitIdentity
    ? 'content-desc="Official verdict"'
    : `resource-id="arena-verdict:${clashId}:${roomId}:${duelStatus}" content-desc="Official verdict"`;
  const topicAttrs = omitIdentity
    ? `content-desc="Clash topic: ${TOPIC}"`
    : `resource-id="arena-verdict-room:${roomId}:${duelStatus}" content-desc="Clash topic: ${TOPIC}"`;
  return `<hierarchy rotation="0">
    <node ${outerAttrs} bounds="[0,0][1080,2340]">
      <node ${topicAttrs} bounds="[42,200][1038,260]" />
      <node content-desc="${winner}" bounds="[42,400][1038,480]" />
      <node text="${tally}" bounds="[42,500][1038,560]" />
      <node content-desc="${aShare}" bounds="[42,600][1038,700]" />
      <node content-desc="${bShare}" bounds="[42,720][1038,820]" />
    </node>
  </hierarchy>`;
}

function startComposedPipeline(getPayload) {
  const h = harness('services/liveArenaService.ts', {}, () => () => null, {
    dependencies: {
      mediaService: {},
      supabaseClient: {
        currentUserId: async () => 'u_c', requestError: (e) => e, SupabaseError: Error,
        requireSupabase: () => ({ rpc: async (fn) => { a.equal(fn, 'get_arena_room'); return { data: getPayload(), error: null }; } }),
      },
    },
  });
  const liveService = h.load('services/liveArenaService.ts');
  const mods = new Map([[1, { verboseName: 'C:\\app\\services\\liveArenaService.ts' }]]);
  const ctx = vm.createContext({
    Promise, JSON, Error, setTimeout, globalThis: null,
    __r: Object.assign((id) => (id === 1 ? liveService : null), { getModules: () => mods }),
  });
  ctx.globalThis = ctx;

  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    wss.on('connection', (ws) => ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      if (req.method === 'Runtime.enable') return ws.send(JSON.stringify({ id: req.id, result: {} }));
      if (req.method === 'Runtime.evaluate') {
        const value = vm.runInContext(req.params.expression, ctx, { timeout: 1000 });
        ws.send(JSON.stringify({ id: req.id, result: { result: { type: typeof value, value } } }));
      }
    }));
    wss.on('listening', () => resolve({
      liveService,
      evalBound: (fnBodyString) => cdp.evaluateHermes({ wsUrl: `ws://127.0.0.1:${wss.address().port}`, fnBodyString, timeoutMs: 3000, pollIntervalMs: 10 }),
      close: () => new Promise((done) => wss.close(done)),
    }));
  });
}

test('composed Room parser -> fetchLiveRoomState -> verifySettledVerdictUi accepts SETTLED/settled and rejects contract violations', async () => {
  let payload = makeRpcPayload();
  const pipe = await startComposedPipeline(() => payload);
  const verdictDb = { winner_side: 'DRAW', jury_size: 2, side_a_score: 1, side_b_score: 1 };
  const baseArgs = {
    expectedRoomId: ROOM_ID, expectedClashId: CLASH_ID, expectedTopic: TOPIC,
    authoritativeVerdict: verdictDb, fighterAName: 'Kevin', fighterBName: 'Elena', pngBuffer: PNG_OK,
  };

  try {
    // 1. Verify production Room parser contract itself stays uppercase SETTLED while Duel stays lowercase settled
    const parsed = await pipe.liveService.fetchRoom(ROOM_ID);
    a.equal(parsed.status, 'SETTLED');
    a.equal(parsed.duel.status, 'settled');
    a.equal(parsed.phase, 'closed');

    // 2. Composed Room -> fetchLiveRoomState (returns 'SETTLED') -> guard PASS
    const hermesState = await liveDevices.fetchLiveRoomState(ROOM_ID, pipe.evalBound);
    a.equal(hermesState.status, 'SETTLED');
    const okProof = settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml(), hermesState });
    a.equal(okProof.passed, true);

    // 3. Lowercase 'settled' and upper/lower boundary helper checks (mixed case / garbage rejected)
    a.equal(settledGuard.normalizeSettledStatus('SETTLED'), 'settled');
    a.equal(settledGuard.normalizeSettledStatus('settled'), 'settled');
    for (const bad of ['OPEN', 'FINAL', 'FINAL_ARGUMENTS', 'JUDGING', 'CANCELLED', 'Settled', 'DONE', '', null, undefined]) {
      a.equal(settledGuard.normalizeSettledStatus(bad), null);
    }

    // 4. Reject non-settled Room statuses coming straight from toRoom
    for (const badStatus of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'CANCELLED']) {
      payload = makeRpcPayload({ status: badStatus, phase: badStatus === 'CANCELLED' ? 'closed' : 'judging', duel: badStatus === 'CANCELLED' ? { status: 'cancelled', verdict: null } : { status: 'open', verdict: null } });
      const badHermes = await liveDevices.fetchLiveRoomState(ROOM_ID, pipe.evalBound);
      a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml(), hermesState: badHermes }), /must be settled/);
    }

    // 5. Reject stale room/clash IDs, wrong phase/duelStatus, wrong winner, wrong tally, malformed PNG, and missing identity
    payload = makeRpcPayload({ roomId: 'ar_stale_123456', duel: { roomId: 'ar_stale_123456' } });
    const staleHermes = await liveDevices.fetchLiveRoomState('ar_stale_123456', pipe.evalBound);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml(), hermesState: staleHermes }), /roomId mismatch/);

    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml(), hermesState: { ...hermesState, phase: 'judging' } }), /must be closed/);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml(), hermesState: { ...hermesState, duelStatus: 'SETTLED' } }), /lowercase settled/);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml({ winner: 'Official winner: SIDE A · Kevin' }), hermesState }), /missing expected winner/);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml({ tally: 'Community verdict · 3 ballots · A 2 · B 1' }), hermesState }), /missing expected ballot tally/);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, pngBuffer: Buffer.from('corrupt'), xml: settledUiXml(), hermesState }), /Screenshot/);
    a.throws(() => settledGuard.verifySettledVerdictUi({ ...baseArgs, xml: settledUiXml({ omitIdentity: true }), hermesState }), /missing verified room\/clash identity/);
  } finally {
    await pipe.close();
  }
});

test('development preview supports ?stage=settled, normalizes cleanly, uses real components, and keeps release gate intact', () => {
  const h = harness('components/dev/devArenaPreviewFixture.ts', {}, () => () => null);
  const fx = h.load('components/dev/devArenaPreviewFixture.ts');
  a.equal(fx.normalizePreviewStage('settled'), 'settled');
  a.equal(fx.normalizePreviewStage(['settled']), 'settled');
  a.equal(fx.normalizePreviewStage('invalid'), 'watch');

  const { room, messages } = fx.buildDevPreviewRoom('settled', 1794300000000, 500);
  a.equal(room.status, 'SETTLED');
  a.equal(room.phase, 'closed');
  a.equal(room.roomId, 'ar_devpreview00001');
  a.equal(room.clashId, 'cl_devpreview00001');
  a.equal(room.duel.status, 'settled');
  a.deepEqual(room.duel.verdict, { winnerSide: 'DRAW', jurySize: 2, sideAScore: 1, sideBScore: 1, verdictLabel: 'Draw' });
  a.ok(room.topic.title.length > 0 && messages.length >= 2);

  const routeSrc = fs.readFileSync(path.join(__dirname, '../app/dev-arena-preview.tsx'), 'utf8');
  a.match(routeSrc, /arenaDemoAllowed\(__DEV__,\s*Constants\.expoConfig\?\.extra\?\.appVariant\)/);
  a.match(routeSrc, /normalizePreviewStage\(stage\)/);
});
