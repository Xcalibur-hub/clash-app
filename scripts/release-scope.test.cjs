const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
const policy = require('../utils/releaseScope.ts');
const { communityVerdictCopy } = require('../utils/communityVerdict.ts');
const { harness, text } = require('./ui-completion-harness.cjs');

function service(file, client = {}) {
  const calls = [], module = { exports: {} };
  const transport = { rpc: async (...args) => { calls.push(args); return { data: {}, error: null }; }, ...client };
  const code = babel.transformSync(fs.readFileSync('services/' + file + '.ts', 'utf8'), {
    filename: file + '.ts', babelrc: false, configFile: false, presets: ['@babel/preset-typescript'],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInThisContext('(function(module,exports,require){' + code + '\n})')(module, module.exports, name => {
    if (name.endsWith('releaseScope')) return policy;
    return new Proxy({ requireSupabase: () => transport, requestError: e => Error(e.message), SupabaseError: Error }, {
      get: (o, k) => k in o ? o[k] : value => value,
    });
  });
  return { api: module.exports, calls };
}
const blocked = {
  meetService: ['joinMeetQueue', 'pollMeetQueue', 'nextMeet'],
  playService: ['joinChallenge', 'joinTreasureHunt'],
  arenaCrewService: ['createArenaCrew', 'joinArenaCrew', 'followArenaCrew', 'inviteToArenaCrew', 'requestArenaCrewJoin'],
  worldService: ['createWorldDrop'],
  creatorAiService: ['addCreatorAiKnowledge'],
  digitalCreatorService: ['startDigitalCreatorSession'],
  creatorLiveService: ['createCreatorLiveSession', 'startCreatorLiveSession'],
  vaultService: ['createVault', 'createDrop', 'publishDrop', 'createCollection', 'addToCollection'],
  vaultCommerceService: ['createCreatorService', 'requestCreatorService', 'createCreatorProduct', 'createCreatorCourse', 'createCourseLesson'],
  sponsorService: ['createAdvertiser', 'activateAdvertiser', 'createCampaign', 'assignCreator', 'createReferralLink', 'createCoupon', 'resumeCampaign'],
  arenaQuestionService: ['createQuestion'],
  hoodGameService: ['createPredictionGame'],
  creatorWorldDropService: ['createCreatorWorldDrop', 'claimWorldDrop'],
  vaultCommunityService: ['createCommunity'],
};
for (const [file, names] of Object.entries(blocked)) for (const name of names) {
  test(`${file}.${name} refuses admission before transport, including deep-link callers`, async () => {
    const s = service(file);
    await assert.rejects(() => s.api[name]({}, {}, {}), /unavailable in the text-debate beta/);
    assert.equal(s.calls.length, 0);
  });
}
test('operation distinctions preserve reads, continuation, exits and safety for every capability', () => {
  for (const cap of Object.keys(policy.RELEASE_SCOPE)) {
    for (const op of ['continue', 'read', 'exit', 'safety', 'accountData']) assert.equal(policy.releaseAllows(cap, op), true);
    assert.equal(policy.releaseAllows(cap, 'admit'), ['account', 'browse', 'publicVault', 'text', 'arena'].includes(cap));
  }
});
test('conditional actions block acceptance/activation, preserve rejection and cancellation transport', async () => {
  const g = service('arenaCrewService');
  await assert.rejects(() => g.api.respondArenaCrewInvite('id', true), /beta/);
  await g.api.respondArenaCrewInvite('id', false);
  await assert.rejects(() => g.api.decideArenaCrewJoinRequest('id', true), /beta/);
  await g.api.decideArenaCrewJoinRequest('id', false);
  assert.deepEqual(g.calls.map(c => c[1].p_accept ?? c[1].p_approve), [false, false]);
  const s = service('sponsorService');
  await assert.rejects(() => s.api.setCampaignStatus('id', 'ACTIVE'), /beta/);
  await s.api.setCampaignStatus('id', 'CANCELLED');
  assert.equal(s.calls[0][1].p_status, 'CANCELLED');
});
test('Meet Leave, messages, reporting and heartbeat still reach their original contracts', async () => {
  const s = service('meetService');
  await s.api.leaveMeetQueue(); await s.api.leaveMeetSession('existing');
  await s.api.cancelMeetSearch('existing-queue');
  await s.api.reportMeetSession('existing', 'other'); await s.api.blockMeetPeer('existing');
  assert.deepEqual(s.calls.map(c => c[0]), ['leave_meet_queue', 'leave_meet_session', 'cancel_meet_search', 'report_meet_session', 'block_meet_peer']);
  assert.equal(s.calls[2][1].p_queue_id, 'existing-queue');
  assert.ok(policy.RELEASE_PRESERVED_CONTRACTS.meet.exit.includes('cancel_meet_search'));
});
test('AI history lookup does not invoke admission RPC and refuses missing conversations', async () => {
  let row = { id: 'existing' }, reads = 0;
  const s = service('creatorAiService', { from(table) {
    assert.equal(table, 'creator_ai_conversations');
    return { select(columns) { assert.equal(columns, 'id'); return { eq(column, id) {
      assert.equal(column, 'creator_id'); assert.equal(id, 'creator');
      return { maybeSingle: async () => { reads++; return { data: row, error: null }; } };
    } }; } };
  } });
  assert.equal((await s.api.startCreatorAiConversation('creator')).conversationId, 'existing');
  row = null; await assert.rejects(() => s.api.startCreatorAiConversation('creator'), /beta/);
  assert.equal(reads, 2); assert.equal(s.calls.length, 0);
});
for (const [route, capability] of Object.entries(policy.RELEASE_NEW_ROUTES)) test(`direct route ${route} mounts unavailable UI instead of creation hooks`, async () => {
  const paths = { '/world/compose': 'app/world/compose.tsx', '/vault/compose': 'app/vault/compose.tsx', '/arena/crews/create': 'app/arena/crews/create.tsx', '/sponsor/new': 'app/sponsor/new.tsx', '/explore/meet/video/prep': 'app/explore/meet/video/prep.tsx' };
  const h = harness('components/shared/ReleaseUnavailable.tsx', {}, e => e.ReleaseUnavailable);
  const guards = h.load('components/shared/ReleaseUnavailable.tsx');
  // Evaluate the real route export; native imports are inert, never invoke creation hooks.
  const inert = new Proxy(function () {}, { get: (_, key) => key === 'create' ? x => x : inert });
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(paths[route], 'utf8'), {
    filename: paths[route], babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInThisContext('(function(module,exports,require){' + code + '\n})')(module, module.exports,
    name => name.endsWith('ReleaseUnavailable') ? guards : name === 'react/jsx-runtime' ? require(name) : inert);
  try { const tree = module.exports.default(); assert.equal(tree.type, guards.ReleaseUnavailable); assert.equal(tree.props.capability, capability); }
  finally { await h.unmount(); }
});
test('unavailable screen wraps text, scales, respects safe areas and has functional Back fallback', async () => {
  const h = harness('components/shared/ReleaseUnavailable.tsx', { capability: 'meet' }, e => e.ReleaseUnavailable);
  try {
    await h.mount(); assert.match(text(h.tree), /Existing authorized access/);
    for (const scale of [1, 1.3]) { h.dimensions.fontScale = scale; await h.update();
      for (const n of h.nodes.filter(n => n.type === 'Text')) { assert.notEqual(n.props.allowFontScaling, false); assert.equal(n.props.numberOfLines, undefined); }
      const back = h.nodes.find(n => n.props.accessibilityLabel === 'Back');
      assert.ok(back.props.style.minHeight >= 44); await h.act(() => back.props.onPress());
    }
    assert.deepEqual(h.calls, [['replace', '/'], ['replace', '/']]);
  } finally { await h.unmount(); }
});
for (const [a, b] of [[0, 0], [1, 0], [5, 0], [3, 2], [2, 2]]) test(`neutral community verdict ${a}-${b}`, () => {
  assert.equal(communityVerdictCopy({ jurySize: a + b, sideAScore: a, sideBScore: b }), `Community verdict · ${a + b} ballot${a + b === 1 ? '' : 's'} · A ${a} · B ${b}`);
});
test('missing/redacted and invalid totals never fabricate side counts', () => {
  assert.match(communityVerdictCopy({}), /unavailable/);
  assert.match(communityVerdictCopy({ jurySize: 2 }), /side totals unavailable/);
  assert.match(communityVerdictCopy({ jurySize: 2, sideAScore: 4, sideBScore: 0 }), /side totals unavailable/);
});

test('service requests and paid external acquisition expose status without interactive admission', async () => {
  for (const accessType of ['paid', 'subscriber', 'contact']) {
    const h = harness('components/vault/ProductAction.tsx', { product: { accessType, externalUrl: 'https://example.invalid/not-opened' } });
    try { await h.mount(); assert.match(text(h.tree), /beta/); assert.equal(h.nodes.some(n => n.props.onPress), false); }
    finally { await h.unmount(); }
  }
  const h = harness('components/vault/ServiceRequest.tsx', { serviceId: 'existing' });
  try { await h.mount(); assert.match(text(h.tree), /beta/); assert.equal(h.nodes.some(n => n.type === 'TextInput' || n.props.onPress), false); }
  finally { await h.unmount(); }
});
test('new Take attachment launcher is a scalable beta status, with no picker callback', async () => {
  let picks = 0; const h = harness('components/arena/MediaAttachRow.tsx', { onPick: () => picks++ });
  try { await h.mount(); assert.match(text(h.tree), /unavailable in the text-debate beta/); assert.equal(h.nodes.some(n => n.props.onPress), false); assert.equal(picks, 0); assert.notEqual(h.tree.props.allowFontScaling, false); }
  finally { await h.unmount(); }
});

test('AI and digital disable remain possible; enabling never reaches transport', async () => {
  const ai = service('creatorAiService');
  await assert.rejects(() => ai.api.saveCreatorAiProfile({ enabled: true }), /beta/);
  await ai.api.saveCreatorAiProfile({ enabled: false });
  assert.equal(ai.calls.length, 1); assert.equal(ai.calls[0][1].p_enabled, false);
  const digital = service('digitalCreatorService');
  await assert.rejects(() => digital.api.saveCreatorDigitalVersion({ avatarEnabled: true }), /beta/);
  await digital.api.saveCreatorDigitalVersion({ avatarEnabled: false, voiceEnabled: false, textFallbackEnabled: false });
  assert.equal(digital.calls.length, 1);
});

for (const [file, name, rpc] of [
  ['playService', 'submitChallengeEntry', 'submit_challenge_entry'],
  ['playService', 'submitTreasureAnswer', 'submit_treasure_answer'],
  ['playService', 'completeContentClue', 'complete_content_clue'],
  ['playService', 'claimTreasureReward', 'claim_treasure_reward'],
  ['creatorLiveService', 'createCreatorLiveInteraction', 'create_creator_live_interaction'],
]) test(`existing participant ${name} still reaches server authorization`, async () => {
  let calls = 0;
  const s = service(file, { rpc(name) { assert.equal(name, rpc); calls++; throw Error('Server authorization boundary'); } });
  await assert.rejects(() => s.api[name]({}, 'existing', 'text'), /Server authorization boundary/);
  assert.equal(calls, 1);
});
test('existing draft publication aliases refuse admission while unpublish remains possible', async () => {
  for (const name of ['setCreatorServiceStatus', 'setCreatorProductStatus', 'setCreatorCourseStatus', 'setCourseLessonStatus']) {
    const s = service('vaultCommerceService');
    await assert.rejects(() => s.api[name]('existing', 'published'), /beta/);
    await s.api[name]('existing', 'archived'); assert.equal(s.calls.length, 1);
  }
  const s = service('creatorWorldDropService');
  await assert.rejects(() => s.api.setCreatorWorldDropStatus('existing', 'PUBLISHED'), /beta/);
  await s.api.setCreatorWorldDropStatus('existing', 'REMOVED'); assert.equal(s.calls.length, 1);
});
test('text Takes and discussions cannot attach new media through the ordinary client service', async () => {
  const s = service('apiService');
  await assert.rejects(() => s.api.postTake('text', 'techtakes', { mediaObjectId: 'new' }), /beta/);
  await assert.rejects(() => s.api.postComment('take', 'text', undefined, { mediaObjectId: 'new' }), /beta/);
  assert.equal(s.calls.length, 0);
});
test('community deep-link reading never creates membership; authorized existing members retain entry', async () => {
  let member = false; const calls = [];
  const s = service('vaultCommunityService', { async rpc(name) {
    calls.push(name); return { data: { id: 'community', viewerAccess: true, viewerIsMember: member, viewerIsCreator: false, viewerCanPost: true }, error: null };
  } });
  const read = await s.api.enterCommunity('community');
  assert.equal(read.viewerCanPost, false); assert.equal(read.viewerCanAnnounce, false);
  assert.deepEqual(calls, ['vault_community_summary']);
  member = true; await s.api.enterCommunity('community');
  assert.deepEqual(calls, ['vault_community_summary', 'vault_community_summary', 'enter_vault_community']);
});
test('community post/reply continuation checks actual membership and derives reply community from the authorized parent', async () => {
  let member = false; const calls = [];
  const s = service('vaultCommunityService', {
    async rpc(name, args) { calls.push(name); return { data: name === 'vault_community_summary' ? { viewerIsMember: member, viewerIsCreator: false } : { id: 'created' }, error: null }; },
    from(table) { assert.equal(table, 'vault_community_posts'); return { select: columns => {
      assert.equal(columns, 'community_id'); return { eq: (column, id) => { assert.equal(column, 'id'); assert.equal(id, 'post');
        return { maybeSingle: async () => ({ data: { community_id: 'actual-community' }, error: null }) }; } };
    } }; },
  });
  await assert.rejects(() => s.api.createCommunityPost({ communityId: 'actual-community' }), /beta/);
  await assert.rejects(() => s.api.createCommunityReply({ postId: 'post' }), /beta/);
  assert.deepEqual(calls, ['vault_community_summary', 'vault_community_summary']);
  member = true;
  await s.api.createCommunityPost({ communityId: 'actual-community' });
  await s.api.createCommunityReply({ postId: 'post' });
  assert.deepEqual(calls.slice(2), ['vault_community_summary', 'create_vault_community_post', 'vault_community_summary', 'create_vault_community_reply']);
});
