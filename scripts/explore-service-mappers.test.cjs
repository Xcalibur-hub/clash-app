/* S4 — service mapper regression tests for services/exploreService.ts.
 *
 * The REAL service module, the REAL visibility utils and the REAL media URL builder are loaded;
 * only the transport (services/supabaseClient) is stubbed, so every assertion below exercises the
 * production mapping code path including its security filters.
 *
 * The payload shapes mirror the deployed SQL exactly. Verified in the migrations:
 *   20261003190000_explore_vault_preview.sql:245-247, 558-560
 *     select id, title, description, challenge_type as "challengeType", country_code as "countryCode",
 *            status, entry_count as "entryCount", ends_at as "endsAt", cover_url as "coverUrl"
 *   20261003190000_explore_vault_preview.sql:259-261, 570-572
 *     select id, title, description, country_code as "countryCode", status, clue,
 *            gifts_remaining as "giftsRemaining", ends_at as "endsAt", reward_type as "rewardType",
 *            cover_url as "coverUrl"
 *   plus 'dropId'/'accessLevel'/'publicMediaPath' for previews and 'kind'/'subtitle'/'score' for
 *   viral items. No client field is invented here.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const babel = require('@babel/core');

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

/** Transport stub: records RPC calls and returns one scripted result at a time. */
const rpcCalls = [];
let nextResult = { data: null, error: null };
const PUBLIC_ORIGIN = 'https://staging.example';
const fakeClient = {
  rpc: async (name, args) => {
    rpcCalls.push({ name, args });
    return nextResult;
  },
  storage: {
    from: (bucket) => ({
      getPublicUrl: (objectPath) => ({
        data: { publicUrl: `${PUBLIC_ORIGIN}/storage/v1/object/public/${bucket}/${objectPath}` },
      }),
    }),
  },
};

class SupabaseError extends Error {
  constructor(message, code = 'unexpected') {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent).replaceAll('\\', '/');
  if (resolved === `${root}/services/supabaseClient.ts`) {
    return {
      __esModule: true,
      SupabaseError,
      supabase: fakeClient,
      requestError: (error) => new SupabaseError(error.message, error.code),
      requireSupabase: () => fakeClient,
      errorText: (error) => (error instanceof Error ? error.message : 'unexpected'),
    };
  }
  return originalLoad.apply(this, arguments);
};

const explore = require('../services/exploreService.ts');

/** Runs one service call against a scripted payload and returns the mapped result. */
async function call(fn, data, { error = null } = {}) {
  rpcCalls.length = 0;
  nextResult = { data, error };
  return fn();
}

/** The single RPC call recorded during the last `call()`. */
function lastCall() {
  assert.equal(rpcCalls.length, 1, `expected exactly one RPC call, saw ${rpcCalls.length}`);
  return rpcCalls[0];
}

const ISO_1 = '2026-10-20T12:00:00.000Z';
const ISO_2 = '2026-10-22T09:00:00.000Z';

/** Row builders — field names and types copied from the SQL aliases above. */
const challengeRow = (over = {}) => ({
  id: 'ch1', title: 'Harbour Clash', description: 'Clash at the harbour', challengeType: 'COUNTRY',
  countryCode: 'IN', status: 'active', entryCount: 12, endsAt: ISO_1, coverUrl: null, ...over,
});
const treasureRow = (over = {}) => ({
  id: 'tr1', title: 'Hidden Gate', description: 'Find the gate', countryCode: 'BR', status: 'active',
  clue: 'Where the tide turns', giftsRemaining: null, endsAt: ISO_2, rewardType: 'badge', coverUrl: null, ...over,
});
const vaultRow = (over = {}) => ({
  dropId: 'd1', vaultId: 'v1', creatorId: 'c1', title: 'Preview drop', accessLevel: 'preview',
  publicMediaPath: 'creator/m1.jpg', mediaKind: 'image', authorHandle: 'sam', authorName: 'Sam',
  authorTint: '#A1A1AA', countryCode: 'IN', ...over,
});
const viralRow = (over = {}) => ({
  kind: 'TAKE', id: 't1', title: 'A take', subtitle: '@sam', score: 42, countryCode: 'IN',
  href: '/take/t1', mediaUrl: null, ...over,
});

const { EXPLORE_COUNTRIES, countryByCode } = require('../data/exploreCountries.ts');
const KNOWN_CODE = EXPLORE_COUNTRIES[0].code;
const UNKNOWN_CODE = 'ZZ';
const publicMediaUrl = (objectPath) =>
  `${PUBLIC_ORIGIN}/storage/v1/object/public/public-media/${objectPath}`;

// ── valid payloads ────────────────────────────────────────────────────────────────────────

test('world summary maps a valid country, challenge and treasure payload exactly', async () => {
  const summary = await call(() => explore.fetchExploreWorldSummary(), {
    countries: [
      { countryCode: KNOWN_CODE, activityCount: 7, hasChallenge: true, hasTreasure: false },
      { countryCode: UNKNOWN_CODE, activityCount: 1, hasChallenge: false, hasTreasure: false },
    ],
    liveTopicCount: 3,
    challenges: [challengeRow({ countryCode: KNOWN_CODE })],
    treasures: [treasureRow()],
    generatedAt: ISO_1,
  });
  const request = lastCall();
  assert.equal(request.name, 'get_explore_world_summary');
  assert.equal(request.args, undefined, 'the summary RPC takes no parameters');

  assert.equal(summary.countries.length, 1, 'a country code the app does not know is dropped');
  assert.deepEqual(summary.countries[0], {
    countryCode: KNOWN_CODE,
    name: countryByCode(KNOWN_CODE).name,
    activityCount: 7,
    hasChallenge: true,
    hasTreasure: false,
    lat: countryByCode(KNOWN_CODE).lat,
    lng: countryByCode(KNOWN_CODE).lng,
  });
  assert.deepEqual(summary.challenges, [{
    id: 'ch1', title: 'Harbour Clash', description: 'Clash at the harbour', challengeType: 'COUNTRY',
    countryCode: KNOWN_CODE, status: 'active', entryCount: 12, endsAt: Date.parse(ISO_1), coverUrl: null,
  }]);
  assert.deepEqual(summary.treasures, [{
    id: 'tr1', title: 'Hidden Gate', description: 'Find the gate', countryCode: 'BR', status: 'active',
    clue: 'Where the tide turns', giftsRemaining: null, endsAt: Date.parse(ISO_2), rewardType: 'badge', coverUrl: null,
  }]);
  assert.equal(summary.liveTopicCount, 3);
  assert.equal(summary.generatedAt, Date.parse(ISO_1));
});

test('vault previews map a valid array payload exactly, with a public-media URL', async () => {
  const previews = await call(() => explore.fetchExploreVaultPreviews(), [vaultRow()]);
  assert.deepEqual(lastCall(), { name: 'list_explore_vault_previews', args: { p_limit: 12 } });
  assert.deepEqual(previews, [{
    dropId: 'd1', vaultId: 'v1', creatorId: 'c1', title: 'Preview drop', accessLevel: 'preview',
    publicMediaPath: 'creator/m1.jpg', mediaUrl: publicMediaUrl('creator/m1.jpg'), mediaKind: 'image',
    authorHandle: 'sam', authorName: 'Sam', authorTint: '#A1A1AA', countryCode: 'IN',
  }]);
});

test('viral items map every supported kind, with the documented defaults', async () => {
  const items = await call(() => explore.fetchGlobalViral(6), {
    items: [
      viralRow({ kind: 'LIVE_ARENA', id: 'a1', title: 'Live room', subtitle: 'Live Arena', score: 1000 }),
      viralRow(),
      viralRow({ kind: 'VAULT_PREVIEW', id: 'd1', title: 'Free drop', accessLevel: 'free', publicMediaPath: 'creator/m9.jpg', score: 50 }),
      viralRow({ kind: 'CHALLENGE', id: 'ch1', title: 'Harbour Clash', score: 22 }),
      viralRow({ kind: 'CLASH', id: 'cl1', title: 'A clash', score: 9 }),
    ],
  });
  assert.deepEqual(lastCall(), { name: 'get_global_viral', args: { p_limit: 6 } });
  assert.equal(items.length, 5, 'every labelled kind is kept');
  assert.deepEqual(items[0], {
    kind: 'LIVE_ARENA', id: 'a1', title: 'Live room', subtitle: 'Live Arena', score: 1000,
    countryCode: 'IN', href: '/take/t1', mediaUrl: null, accessLevel: null,
  });
  assert.deepEqual(items[2], {
    kind: 'VAULT_PREVIEW', id: 'd1', title: 'Free drop', subtitle: '@sam', score: 50,
    countryCode: 'IN', href: '/take/t1', mediaUrl: publicMediaUrl('creator/m9.jpg'), accessLevel: 'free',
  });
});

// ── partial payloads: the item is kept and defaults are applied ──────────────────────────

test('a partial challenge keeps its place and takes the documented defaults', async () => {
  const summary = await call(() => explore.fetchExploreWorldSummary(), {
    challenges: [challengeRow({
      description: undefined, countryCode: undefined, coverUrl: undefined,
      entryCount: undefined, status: undefined, challengeType: 'SOMETHING_NEW',
    })],
    treasures: [],
  });
  assert.deepEqual(summary.challenges, [{
    id: 'ch1', title: 'Harbour Clash', description: null, challengeType: 'GLOBAL',
    countryCode: null, status: 'active', entryCount: 0, endsAt: Date.parse(ISO_1), coverUrl: null,
  }], 'an unknown challengeType falls back to GLOBAL rather than dropping the item');
});

test('a partial treasure keeps its place and takes the documented defaults', async () => {
  const summary = await call(() => explore.fetchExploreWorldSummary(), {
    challenges: [],
    treasures: [treasureRow({ rewardType: undefined, description: undefined, countryCode: undefined, giftsRemaining: undefined })],
  });
  assert.deepEqual(summary.treasures, [{
    id: 'tr1', title: 'Hidden Gate', description: null, countryCode: null, status: 'active',
    clue: 'Where the tide turns', giftsRemaining: 0, endsAt: Date.parse(ISO_2), rewardType: 'badge', coverUrl: null,
  }], 'a missing giftsRemaining reads as 0 while an explicit null is preserved');
});

test('a partial vault preview falls back to the creator fields and defaults', async () => {
  const previews = await call(() => explore.fetchExploreVaultPreviews(), [vaultRow({
    title: undefined, vaultId: undefined, creatorId: undefined, mediaKind: undefined,
    authorHandle: undefined, authorName: undefined, authorTint: undefined, countryCode: undefined,
    creatorHandle: 'kim', creatorName: 'Kim',
  })]);
  assert.deepEqual(previews, [{
    dropId: 'd1', vaultId: '', creatorId: '', title: 'Preview', accessLevel: 'preview',
    publicMediaPath: 'creator/m1.jpg', mediaUrl: publicMediaUrl('creator/m1.jpg'), mediaKind: null,
    authorHandle: 'kim', authorName: 'Kim', authorTint: '#A1A1AA', countryCode: null,
  }]);
});

test('a partial viral item keeps its place and defaults its score', async () => {
  const items = await call(() => explore.fetchGlobalViral(), {
    items: [viralRow({ subtitle: undefined, score: undefined, countryCode: undefined, href: undefined })],
  });
  assert.deepEqual(items, [{
    kind: 'TAKE', id: 't1', title: 'A take', subtitle: null, score: 0,
    countryCode: null, href: null, mediaUrl: null, accessLevel: null,
  }]);
});

// ── malformed items: dropped, siblings retained, no throw ────────────────────────────────

test('malformed challenges and treasures are dropped while their siblings survive', async () => {
  const summary = await call(() => explore.fetchExploreWorldSummary(), {
    challenges: [
      challengeRow({ id: undefined }),
      challengeRow({ title: undefined }),
      challengeRow({ endsAt: undefined }),
      challengeRow({ endsAt: 1793000000000 }),
      challengeRow({ endsAt: 'not a date' }),
      challengeRow({ id: 'ch2', title: 'Kept' }),
      null, 'nonsense', 42,
    ],
    treasures: [
      treasureRow({ clue: undefined }),
      treasureRow({ id: undefined }),
      treasureRow({ id: 'tr2', title: 'Kept' }),
    ],
  });
  assert.deepEqual(summary.challenges.map((c) => c.id), ['ch2'],
    'a challenge needs a string id, title and parseable endsAt');
  assert.deepEqual(summary.treasures.map((t) => t.id), ['tr2'],
    'a treasure additionally needs a clue; non-object entries are ignored');
});

test('malformed vault previews and viral items are dropped without touching valid ones', async () => {
  const previews = await call(() => explore.fetchExploreVaultPreviews(), [
    vaultRow({ dropId: undefined }),
    vaultRow({ accessLevel: 'subscriber' }),
    null, 12, 'nonsense',
    vaultRow({ dropId: 'd2', title: 'Kept' }),
  ]);
  assert.deepEqual(previews.map((p) => p.dropId), ['d2']);

  const items = await call(() => explore.fetchGlobalViral(), {
    items: [
      viralRow({ kind: undefined }),
      viralRow({ id: undefined }),
      viralRow({ title: undefined }),
      viralRow({ kind: 'NOT_A_KIND' }),
      null, 'nonsense',
      viralRow({ id: 'kept' }),
    ],
  });
  // Documented behaviour: only an id and a title are required. `kind` is a bare TypeScript cast,
  // so an unrecognised kind is passed through verbatim (the UI's kind→label switch then falls back
  // to TAKE). Recorded here so S5/S6 can decide whether to tighten it.
  assert.deepEqual(items.map((i) => i.id), ['t1', 'kept']);
  assert.equal(items[0].kind, 'NOT_A_KIND', 'an unknown kind is not validated at the mapper');
});

// ── wrong-type payloads: an empty result, never a throw ──────────────────────────────────

test('a wrong-type payload is handled per RPC: the summary throws, the lists degrade to empty', async () => {
  // Documented asymmetry: the summary RPC treats a non-object payload as unusable and throws
  // (code 'bad_payload'), while the list RPCs cannot tell "no data" from "nothing to show".
  // S5 extends this distinction to the list payloads.
  for (const payload of [null, 'nonsense', 7, []]) {
    await assert.rejects(
      () => call(() => explore.fetchExploreWorldSummary(), payload),
      (error) => {
        assert.equal(error.name, 'SupabaseError');
        assert.equal(error.code, 'bad_payload');
        return true;
      },
      `summary must reject ${JSON.stringify(payload)}`,
    );
  }

  // An object payload is salvaged: unusable members degrade to empty, the call still succeeds.
  const salvaged = await call(() => explore.fetchExploreWorldSummary(), {
    challenges: 'nonsense', treasures: 7, countries: {}, liveTopicCount: 'x', generatedAt: 123,
  });
  assert.deepEqual(salvaged.treasures, []);
  assert.deepEqual(salvaged.countries, []);
  assert.deepEqual(salvaged.challenges, []);
  assert.equal(salvaged.liveTopicCount, 0);
  assert.equal(typeof salvaged.generatedAt, 'number', 'a numeric generatedAt falls back to now');

  const partialObject = await call(() => explore.fetchExploreWorldSummary(), {
    challenges: [challengeRow()], treasures: [treasureRow()],
  });
  assert.equal(partialObject.challenges.length, 1, 'an absent countries list does not lose challenges');
  assert.equal(partialObject.treasures.length, 1);

  for (const payload of [null, { not: 'an array' }, 'nonsense', 7]) {
    assert.deepEqual(await call(() => explore.fetchExploreVaultPreviews(), payload), []);
  }
  for (const payload of [null, { items: 'nonsense' }, [], 7]) {
    assert.deepEqual(await call(() => explore.fetchGlobalViral(), payload), []);
  }
});

test('a transport error still surfaces as a typed SupabaseError', async () => {
  await assert.rejects(
    () => call(() => explore.fetchExploreVaultPreviews(), null, { error: { message: 'boom', code: '42501' } }),
    (error) => {
      assert.equal(error.name, 'SupabaseError');
      assert.equal(error.code, '42501');
      return true;
    },
  );
});

// ── security-sensitive filtering: Vault FREE/PREVIEW + public media only ─────────────────

test('a VAULT_PREVIEW is shown only for FREE or PREVIEW access with a public media path', async () => {
  const cases = [
    [{ accessLevel: 'free', publicMediaPath: 'creator/m1.jpg' }, 1],
    [{ accessLevel: 'preview', publicMediaPath: 'creator/m1.jpg' }, 1],
    [{ accessLevel: 'subscriber', publicMediaPath: 'creator/m1.jpg' }, 0],
    [{ accessLevel: 'free', publicMediaPath: null }, 0],
    [{ accessLevel: 'preview', publicMediaPath: null }, 0],
    [{ accessLevel: undefined, publicMediaPath: 'creator/m1.jpg' }, 0],
    [{ accessLevel: 'FREE', publicMediaPath: 'creator/m1.jpg' }, 0],
    [{ accessLevel: 'subscriber', publicMediaPath: null }, 0],
  ];
  for (const [over, expected] of cases) {
    const items = await call(() => explore.fetchGlobalViral(), {
      items: [viralRow({ kind: 'VAULT_PREVIEW', id: 'd1', title: 'Drop', ...over })],
    });
    assert.equal(items.length, expected, `accessLevel=${over.accessLevel} path=${over.publicMediaPath}`);
  }
});

test('an Explore media URL is always public-media, never a private bucket', async () => {
  const items = await call(() => explore.fetchGlobalViral(), {
    items: [
      viralRow({ kind: 'VAULT_PREVIEW', id: 'd1', title: 'Free', accessLevel: 'free', publicMediaPath: 'creator/private.jpg' }),
      viralRow({ kind: 'VAULT_PREVIEW', id: 'd2', title: 'Preview', accessLevel: 'preview', publicMediaPath: 'creator/teaser.jpg' }),
      viralRow({ kind: 'VAULT_PREVIEW', id: 'd3', title: 'Preview w/ url', accessLevel: 'preview', publicMediaPath: null, mediaUrl: 'https://cdn.example/explicit.jpg' }),
    ],
  });
  for (const item of items) {
    assert.ok(item.mediaUrl.startsWith(`${PUBLIC_ORIGIN}/storage/v1/object/public/public-media/`), item.mediaUrl);
    assert.equal(item.mediaUrl.includes('private-media'), false, 'the private bucket is unreachable from Explore');
  }
  assert.equal(items.length, 2, 'a drop with no public path is dropped even when a mediaUrl is supplied');
  const previews = await call(() => explore.fetchExploreVaultPreviews(), [
    vaultRow({ dropId: 'ok', accessLevel: 'subscriber' }),
    vaultRow({ dropId: 'kept', accessLevel: 'preview' }),
  ]);
  assert.deepEqual(previews.map((p) => p.dropId), ['kept'], 'the same rule holds on the shelf RPC');
});

// ── contract preservation: the RPC names and parameters Explore depends on ──────────────

test('the RPC names and parameters Explore sends are unchanged', async () => {
  const checks = [
    [() => explore.fetchExploreWorldSummary(), {}, 'get_explore_world_summary', undefined],
    [() => explore.fetchExploreCountry(KNOWN_CODE), {}, 'get_explore_country', { p_country_code: KNOWN_CODE }],
    [() => explore.fetchGlobalViral(9), { items: [] }, 'get_global_viral', { p_limit: 9 }],
    [() => explore.fetchExploreVaultPreviews(4), [], 'list_explore_vault_previews', { p_limit: 4 }],
    [() => explore.fetchExploreForYou(24, 30), { items: [] }, 'get_explore_for_you', { p_limit: 24, p_cursor: 30 }],
    [() => explore.fetchExploreLive(5), {}, 'get_explore_live', { p_limit: 5 }],
    [() => explore.fetchTeleportCandidate(['a', 'b']), {}, 'get_teleport_candidate', { p_exclude_ids: ['a', 'b'] }],
    [() => explore.searchExplore('harbour', 7), {}, 'search_explore', { p_query: 'harbour', p_limit: 7 }],
  ];
  for (const [fn, payload, name, args] of checks) {
    await call(fn, payload);
    const request = lastCall();
    assert.equal(request.name, name);
    assert.deepEqual(request.args, args, `${name} parameters must not change`);
  }
  await assert.rejects(() => explore.fetchExploreCountry('india'), /Invalid country/);
});

// ── S5: mapping reports tell an empty payload from an unreadable one ─────────────────────

const payload = require('../utils/explorePayload.ts');

test('the feed report separates empty, all-rejected, partial and valid responses', async () => {
  const feed = (data) => call(() => explore.fetchExploreForYou(), data);

  const empty = await feed({ items: [], nextCursor: null });
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.report, { received: 0, mapped: 0, rejected: 0 }, 'nothing arrived');
  assert.equal(payload.explorePayloadState(empty.report), 'empty', 'and that is genuinely empty');

  const allRejected = await feed({
    items: [null, 7, { kind: 'TAKE' }, viralRow({ title: undefined })], nextCursor: 0,
  });
  assert.deepEqual(allRejected.items, []);
  assert.deepEqual(allRejected.report, { received: 4, mapped: 0, rejected: 4 });
  const rejectedState = payload.explorePayloadState(allRejected.report);
  assert.equal(rejectedState, 'all_rejected', 'four rows arrived and none could be read');
  assert.equal(payload.explorePayloadNeedsRetry(rejectedState), true);
  assert.match(payload.explorePayloadMessage(rejectedState), /Try again/);

  const partial = await feed({ items: [viralRow(), null, viralRow({ id: undefined })], nextCursor: 12 });
  assert.equal(partial.items.length, 1, 'safe rows are retained');
  assert.deepEqual(partial.report, { received: 3, mapped: 1, rejected: 2 });
  assert.equal(partial.nextCursor, 12, 'pagination is unaffected by rejected rows');
  assert.equal(payload.explorePayloadState(partial.report), 'partial');

  const valid = await feed({ items: [viralRow(), viralRow({ id: 't2' })], nextCursor: 24 });
  assert.deepEqual(valid.report, { received: 2, mapped: 2, rejected: 0 });
  assert.equal(payload.explorePayloadState(valid.report), 'ok');
});

test('the live report spans both lists and is empty only when nothing arrived', async () => {
  const live = await call(() => explore.fetchExploreLive(), {
    topics: [{ id: 'tp1', title: 'Topic' }, null], takes: [7],
  });
  assert.equal(live.topics.length, 1);
  assert.deepEqual(live.report, { received: 3, mapped: 1, rejected: 2 });

  const nothing = await call(() => explore.fetchExploreLive(), {});
  assert.deepEqual(nothing.report, { received: 0, mapped: 0, rejected: 0 });
  assert.equal(payload.explorePayloadState(nothing.report), 'empty');

  const unreadable = await call(() => explore.fetchExploreLive(), { topics: [null], takes: ['x'] });
  assert.deepEqual(unreadable.report, { received: 2, mapped: 0, rejected: 2 });
  assert.equal(payload.explorePayloadState(unreadable.report), 'all_rejected');
});

test('the vault shelf report counts rows the visibility rule refused, without leaking them', async () => {
  const shelf = await call(() => explore.fetchExploreVaultPreviewsWithReport(), [
    vaultRow({ dropId: 'a', accessLevel: 'subscriber' }),
    vaultRow({ dropId: 'b', accessLevel: 'preview', publicMediaPath: null }),
    vaultRow({ dropId: 'c' }),
  ]);
  assert.equal(shelf.items.length, 1);
  assert.deepEqual(shelf.items.map((item) => item.dropId), ['c']);
  assert.deepEqual(shelf.report, { received: 3, mapped: 1, rejected: 2 });
  assert.equal(JSON.stringify(shelf.report).includes('b'), false, 'a report is counts only');

  // The array-returning entry point keeps its existing contract.
  const array = await call(() => explore.fetchExploreVaultPreviews(), [vaultRow()]);
  assert.equal(Array.isArray(array), true);
  assert.equal(array.length, 1);
  assert.equal(array[0].dropId, 'd1');
});
