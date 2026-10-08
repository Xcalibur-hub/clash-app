const fs = require('fs'),
  Module = require('module'),
  babel = require('@babel/core'),
  assert = require('node:assert/strict'),
  realReact = require('react'),
  RN = require('react-native-web');
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', {
    runtime: 'automatic'
  }]],
  plugins: ['@babel/plugin-transform-modules-commonjs']
}).code, file);
let uid = 'auth-a',
  reply,
  error = null,
  captured,
  calls = 0,
  switchOnReply = false,
  values = [],
  si = 0,
  ri = 0,
  refs = [],
  writes = [],
  focus = [],
  routes = [],
  deferred;
const react = {
  ...realReact,
  useState(initial) {
    const i = si++;
    return [i < values.length ? values[i] : initial, v => writes.push([i, v])];
  },
  useRef(initial) {
    return refs[ri++] ?? (refs[ri - 1] = {
      current: initial
    });
  },
  useCallback: fn => fn
};
const callsByName = [];
const client = {
  rpc(name, args) {
    callsByName.push(name);
    assert.equal(this, client);
    captured = {
      name,
      args
    };
    calls++;
    return {
      abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal);
        if (switchOnReply) uid = 'auth-b';
        return deferred ?? Promise.resolve({
          data: typeof reply === 'function' ? reply(name) : reply,
          error
        });
      }
    };
  }
};
const original = Module._load;
let theme, focusedLoad;
Module._load = function (request, parent) {
  if (request === 'react') return react;
  if (request === 'react-native') return {
    ...RN,
    AppState: {
      currentState: 'active',
      addEventListener: () => ({
        remove() {}
      })
    },
    Alert: {
      alert(title, body, buttons) {
        captured = {
          title,
          body,
          buttons
        };
      }
    }
  };
  if (request === 'expo-router') return {
    useRouter: () => ({
      push: p => routes.push(p)
    }),
    useFocusEffect: fn => focus.push(fn)
  };
  const file = Module._resolveFilename(request, parent).replaceAll('\\', '/');
  if (file.endsWith('/services/supabaseClient.ts')) return {
    requireSupabase: () => client,
    currentUserId: async () => uid,
    requestError: e => Object.assign(new Error(e.message), {
      code: e.code
    }),
    SupabaseError: class extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
      }
    }
  };
  if (file.endsWith('/store/AuthProvider.tsx')) return {
    useAuth: () => ({
      user: {
        id: 'auth-a'
      }
    })
  };
  if (file.endsWith('/theme/index.ts')) return theme;
  if (file.endsWith('/utils/haptics.ts')) return {
    tap() {}
  };
  return original.apply(this, arguments);
};
function item(id = 'ch') {
  return {
    id,
    takeId: 'take-source',
    challengerId: 'b',
    challengedId: 'a',
    counterPosition: 'A detailed counter-position.',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 10000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    resolvedAt: null,
    clashId: null,
    roomId: null,
    created: false,
    challenger: {
      id: 'b',
      name: 'Sender',
      handle: 'sender'
    },
    recipient: {
      id: 'a',
      name: 'Recipient',
      handle: 'recipient'
    },
    source: {
      id: 'take-source',
      title: 'Actual source',
      hood: 'techtakes'
    }
  };
}
function reset(state = []) {
  values = state;
  si = 0;
  ri = 0;
  refs = [];
  writes = [];
  focus = [];
  routes = [];
  deferred = undefined;
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  return [tree, ...realReact.Children.toArray(tree.props?.children).flatMap(nodes), ...nodes(tree.props?.ListHeaderComponent), ...nodes(tree.props?.ListFooterComponent), ...(tree.props?.renderItem ? (tree.props.data ?? []).flatMap((item, index) => nodes(tree.props.renderItem({
    item,
    index
  }))) : [])];
}
async function main() {
  theme = {
    ...require('../theme/layout.ts'),
    ...require('../theme/typography.ts'),
    useThemeColors: () => require('../theme/palettes.ts').darkTheme
  };
  const service = require('../services/arenaChallengeService.ts'),
    helpers = require('../utils/challengeInbox.ts');
  const a = item();
  reply = {
    viewerId: 'a',
    items: [a],
    hasMore: false
  };
  assert.equal((await service.fetchChallengeInbox('INCOMING', 'auth-a')).items.length, 1);
  assert.deepEqual(captured.args, {
    p_direction: 'INCOMING',
    p_limit: 20
  });
  console.log('PASS caller-derived inbox request has no owner parameter');
  await service.fetchChallengeInbox('INCOMING', 'auth-a', a);
  assert.equal(captured.args.p_before_id, a.id);
  assert.equal(captured.args.p_before_created_at, a.createdAt);
  console.log('PASS exact keyset cursor and bounded page request');
  assert.throws(() => helpers.parseChallengeInbox(reply, 'OUTGOING'));
  assert.throws(() => helpers.parseChallengeInbox({
    ...reply,
    items: [a, a]
  }, 'INCOMING'));
  assert.throws(() => helpers.parseChallengeInbox({
    ...reply,
    items: [{
      ...a,
      recipient: {
        ...a.recipient,
        id: 'other'
      }
    }]
  }, 'INCOMING'));
  console.log('PASS wrong account direction, duplicate rows and forged recipient rejected');
  uid = 'auth-b';
  const before = calls;
  await assert.rejects(service.fetchChallengeInbox('INCOMING', 'auth-a'), {
    code: 'account_changed'
  });
  await assert.rejects(service.resolveArenaChallenge('ch', 'ACCEPT', 'auth-a'), {
    code: 'account_changed'
  });
  assert.equal(calls, before);
  console.log('PASS old-account reads and actions never submitted');
  uid = 'auth-a';
  switchOnReply = true;
  await assert.rejects(service.fetchChallengeInbox('INCOMING', 'auth-a'), {
    code: 'account_changed'
  });
  switchOnReply = false;
  uid = 'auth-a';
  console.log('PASS late inbox response rejected after account switch');
  reply = {
    ...a,
    status: 'PASSED',
    resolvedAt: new Date().toISOString()
  };
  assert.equal((await service.resolveArenaChallenge('ch', 'PASS', 'auth-a')).status, 'PASSED');
  assert.deepEqual(captured.args, {
    p_challenge_id: 'ch',
    p_action: 'PASS'
  });
  console.log('PASS decline uses existing PASS RPC without actor override');
  error = {
    code: 'P0003',
    message: 'Internal SQL detail'
  };
  await assert.rejects(service.resolveArenaChallenge('ch', 'ACCEPT', 'auth-a'), {
    code: 'P0003'
  });
  assert.ok(!helpers.challengeInboxError(error).includes('Internal SQL'));
  error = null;
  console.log('PASS terminal conflict is propagated and safely explained');
  const accepted = {
    ...a,
    status: 'ACCEPTED',
    resolvedAt: new Date().toISOString(),
    clashId: 'clash-canonical',
    roomId: 'room-canonical'
  };
  assert.equal(helpers.challengeDestination(accepted), '/arena/room/room-canonical');
  assert.equal(helpers.challengeDestination(a), '/take/take-source');
  assert.equal(helpers.challengeDestination({
    ...accepted,
    roomId: null
  }), '/take/take-source');
  console.log('PASS canonical link routes to Room; pending and non-ready stay on Take');
  const {
    ChallengeInbox
  } = require('../components/arena/ChallengeInbox.tsx');
  reset(['INCOMING', [a], false, false, null, null, null, 0]);
  let tree = ChallengeInbox();
  let buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'button');
  assert.ok(buttons.some(n => n.props.accessibilityLabel === 'Accept'));
  assert.ok(buttons.some(n => n.props.accessibilityLabel === 'Decline'));
  assert.ok(!buttons.some(n => n.props.accessibilityLabel === 'Cancel invitation'));
  console.log('PASS incoming exposes recipient-only controls');
  reset(['OUTGOING', [a], false, false, null, null, null, 0]);
  tree = ChallengeInbox();
  buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'button');
  buttons.find(n => n.props.accessibilityLabel === 'Cancel invitation').props.onPress();
  assert.equal(captured.buttons[1].style, 'destructive');
  assert.ok(!buttons.some(n => n.props.accessibilityLabel === 'Accept'));
  console.log('PASS outgoing uses cancellation confirmation and no accept control');
  reset(['INCOMING', [{
    ...accepted,
    roomId: null
  }], false, false, null, null, null, 0]);
  tree = ChallengeInbox();
  assert.ok(nodes(tree).some(n => n.props.children === 'Accepted · Room not ready yet.'));
  assert.ok(!nodes(tree).some(n => n.props.accessibilityLabel === 'Open Room'));
  console.log('PASS accepted missing Room renders explicit non-ready state');
  reset(['INCOMING', [a], false, false, 'ch', null, null, 0]);
  tree = ChallengeInbox();
  assert.ok(nodes(tree).filter(n => n.props.accessibilityRole === 'button').every(n => n.props.disabled));
  console.log('PASS action in flight disables all submission and navigation buttons');
  reset(['INCOMING', [a], true, false, null, null, null, 0]);
  tree = ChallengeInbox();
  refs[1].current = true;
  reply = {
    viewerId: 'a',
    items: [a, {
      ...a,
      id: 'ch-next'
    }],
    hasMore: false
  };
  nodes(tree).find(n => n.props.accessibilityLabel === 'Load more').props.onPress();
  await new Promise(r => setImmediate(r));
  assert.equal(captured.args.p_before_id, a.id);
  const merged = writes.find(([i, v]) => i === 1 && typeof v === 'function')[1]([a]);
  assert.equal(merged.length, 2);
  console.log('PASS actual Load more preserves previous rows and deduplicates boundary');
  writes = [];
  reply = {
    viewerId: 'a',
    items: [{
      ...a,
      status: 'PASSED',
      resolvedAt: new Date().toISOString()
    }],
    hasMore: false
  };
  nodes(tree).find(n => n.props.accessibilityLabel === 'Refresh').props.onPress();
  await new Promise(r => setImmediate(r));
  assert.equal(writes.find(([i, v]) => i === 1 && typeof v === 'function')[1](merged).length, 1);
  assert.ok(!('p_before_id' in captured.args));
  console.log('PASS actual refresh replaces page and resets cursor');
  reset(['INCOMING', [a], false, false, null, null, null, 0]);
  tree = ChallengeInbox();
  refs[1].current = true;
  reply = name => name === 'resolve_arena_challenge' ? accepted : {
    viewerId: 'a',
    items: [accepted],
    hasMore: false
  };
  const acceptButton = nodes(tree).find(n => n.props.accessibilityLabel === 'Accept');
  const actionBefore = callsByName.filter(n => n === 'resolve_arena_challenge').length;
  acceptButton.props.onPress();
  acceptButton.props.onPress();
  await new Promise(r => setImmediate(r));
  assert.equal(callsByName.filter(n => n === 'resolve_arena_challenge').length - actionBefore, 1);
  assert.equal(captured.name, 'list_my_arena_challenges');
  console.log('PASS duplicate action taps submit once and refresh canonical state');
  let resolve;
  reset();
  deferred = new Promise(r => resolve = r);
  ChallengeInbox();
  const dispose = focus[0]();
  await new Promise(r => setImmediate(r));
  writes = [];
  dispose();
  resolve({
    data: {
      viewerId: 'a',
      items: [a],
      hasMore: false
    },
    error: null
  });
  await new Promise(r => setImmediate(r));
  assert.equal(writes.length, 0);
  console.log('PASS disposed focus/account cannot receive late inbox state');
  reset();
  let resolveTab;
  deferred = new Promise(r => resolveTab = r);
  tree = ChallengeInbox();
  const disposeTab = focus[0]();
  await new Promise(r => setImmediate(r));
  nodes(tree).find(n => n.props.accessibilityLabel === 'Outgoing challenges').props.onPress();
  assert.ok(writes.some(([i, v]) => i === 1 && Array.isArray(v) && v.length === 0));
  writes = [];
  resolveTab({
    data: {
      viewerId: 'a',
      items: [a],
      hasMore: false
    },
    error: null
  });
  await new Promise(r => setImmediate(r));
  assert.equal(writes.length, 0);
  disposeTab();
  console.log('PASS switching sections clears rows and rejects old-direction response immediately');
  uid = 'auth-a';
  switchOnReply = true;
  reply = accepted;
  await assert.rejects(service.resolveArenaChallenge('ch', 'ACCEPT', 'auth-a'), {
    code: 'account_changed'
  });
  switchOnReply = false;
  uid = 'auth-a';
  console.log('PASS late action response rejected after account switch');
  console.log('18/18 challenge inbox client/component checks passed; hook bridge is not physical verification.');
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
