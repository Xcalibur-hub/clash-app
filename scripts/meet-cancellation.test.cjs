// Phase 6F.4 — mounted Meet cancellation acceptance (offline).
// Uses cancel_meet_search; never relies on poll_meet_queue for cancel recovery.
// Kept separate from npm test; does not prove PostgreSQL lock behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const { harness, deferred } = require('./ui-completion-harness.cjs');

function compile(file, source, dependencies) {
  const module = { exports: {} };
  const code = babel.transformSync(source, {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: ['@babel/preset-typescript'],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInThisContext('(function(module,exports,require){' + code + '\n})')(module, module.exports, dependencies);
  return module.exports;
}

const policy = compile('utils/releaseScope.ts', fs.readFileSync('utils/releaseScope.ts', 'utf8'), () => ({}));
const serviceSource = fs.readFileSync('services/meetService.ts', 'utf8');
const input = { mode: 'ANYWHERE', channel: 'TEXT' };

function setup(options = {}) {
  const model = {
    queue: 'waiting',
    active: false,
    actor: 'A',
    owner: 'A',
    calls: [],
  };
  const queued = () => ({
    queued: true,
    matched: false,
    queueId: 'fictional-queue',
    queuedAt: new Date().toISOString(),
    mode: 'ANYWHERE',
    channel: 'TEXT',
  });
  const session = () => ({
    sessionId: 'fictional-session',
    mode: 'ANYWHERE',
    channel: 'TEXT',
    status: model.active ? 'active' : 'ended',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });

  const transport = {
    async rpc(name, args) {
      model.calls.push({ name, args, actor: model.actor });
      if (name === 'join_meet_queue') {
        return options.join ? options.join.promise : { data: queued() };
      }
      if (name === 'poll_meet_queue') {
        return {
          data: model.active
            ? { queued: false, matched: true, queueId: 'fictional-queue', session: session() }
            : queued(),
        };
      }
      if (name === 'leave_meet_queue') {
        if (options.leave) await options.leave.promise;
        if (options.failLeave) return { error: { message: 'Fictional offline transport failure' } };
        if (model.queue === 'waiting') model.queue = 'cancelled';
        return { data: { left: true } };
      }
      if (name === 'cancel_meet_search') {
        if (options.cancel) await options.cancel.promise;
        if (options.failCancel) return { error: { message: 'Fictional offline cancel failure' } };
        const qid = args?.p_queue_id;
        if (!qid || qid !== 'fictional-queue') {
          return { data: { outcome: 'not_found', queueId: qid ?? '', resolved: false } };
        }
        if (model.actor !== model.owner) {
          return { data: { outcome: 'not_found', queueId: qid, resolved: false } };
        }
        if (model.queue === 'waiting') {
          model.queue = 'cancelled';
          return { data: { outcome: 'cancelled_waiting', queueId: qid, resolved: true } };
        }
        if (model.queue === 'matched' && model.active) {
          model.active = false;
          model.queue = 'cancelled';
          return {
            data: {
              outcome: 'ended_session',
              queueId: qid,
              sessionId: 'fictional-session',
              resolved: true,
            },
          };
        }
        return { data: { outcome: 'already_terminal', queueId: qid, resolved: true } };
      }
      if (name === 'leave_meet_session') {
        if (model.actor !== model.owner) return { error: { message: 'Not a participant' } };
        model.active = false;
        return { data: { left: true } };
      }
      if (name === 'get_meet_session') return { data: session() };
      if (name === 'report_meet_session' || name === 'block_meet_peer' || name === 'report_meet_message') {
        return { data: { ok: true } };
      }
      if (name === 'next_meet') throw Error('next_meet should be denied before transport');
      throw Error('Unexpected offline RPC: ' + name);
    },
  };

  const dependencies = (name) =>
    name.endsWith('releaseScope')
      ? policy
      : name.endsWith('supabaseClient')
        ? {
            requireSupabase: () => transport,
            requestError: (e) => Error(e.message),
            SupabaseError: Error,
          }
        : {};

  const actual = compile('services/meetService.ts', serviceSource, dependencies);
  // Prior-admission join only: strip admission assert so tests can start a search.
  const priorAdmission = compile(
    'services/meetService.ts',
    serviceSource.replaceAll("  assertReleaseAdmission('meet');", ''),
    dependencies,
  );
  const service = {
    ...actual,
    joinMeetQueue: priorAdmission.joinMeetQueue,
    pollMeetQueue: actual.pollMeetQueue,
    cancelMeetSearch: actual.cancelMeetSearch,
  };

  let api;
  let timerId = 0;
  const timers = new Map();
  const h = harness(
    'hooks/useMeetSearch.ts',
    {},
    (exports) => () => {
      api = exports.useMeetSearch();
      return null;
    },
    {
      dependencies: {
        meetService: service,
        supabaseClient: { errorText: (e) => e.message },
        'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
      },
      setTimeout: (fn) => {
        timers.set(++timerId, fn);
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  return {
    h,
    model,
    actual,
    queued,
    get api() {
      return api;
    },
    timers,
    match() {
      model.queue = 'matched';
      model.active = true;
    },
  };
}

async function admitted(t, options) {
  const x = setup(options);
  await x.h.mount();
  t.after(() => x.h.unmount());
  await x.h.act(async () => {
    await x.api.start(input);
  });
  assert.equal(x.api.phase, 'searching');
  x.model.calls.length = 0;
  return x;
}

const names = (x) => x.model.calls.map((c) => c.name);

test('waiting cancellation succeeds via cancel_meet_search without matcher poll', async (t) => {
  const x = await admitted(t);
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.equal(x.model.queue, 'cancelled');
  assert.equal(x.api.phase, 'idle');
  assert.deepEqual(names(x), ['cancel_meet_search']);
  assert.equal(x.model.calls[0].args.p_queue_id, 'fictional-queue');
});

test('match immediately before Cancel ends the linked session', async (t) => {
  const x = await admitted(t);
  x.match();
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.deepEqual(names(x), ['cancel_meet_search']);
  assert.equal(x.model.active, false);
  assert.equal(x.api.phase, 'idle');
});

test('match while Cancel is pending is ended when cancel acquires the queue', async (t) => {
  const cancel = deferred();
  const x = await admitted(t, { cancel });
  let pending;
  await x.h.act(async () => {
    pending = x.api.cancel();
  });
  x.match();
  await x.h.act(async () => {
    cancel.resolve();
    await pending;
  });
  assert.equal(x.model.active, false);
  assert.deepEqual(names(x), ['cancel_meet_search']);
});

test('failed cancellation exposes unresolved notice and keeps idle', async (t) => {
  const x = await admitted(t, { failCancel: true });
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.equal(x.model.queue, 'waiting');
  assert.equal(x.api.phase, 'idle');
  assert.ok(x.api.error || x.api.notice, 'unresolved cleanup must surface');
});

test('delayed successful waiting cancellation retains idle and performs no admission', async (t) => {
  const cancel = deferred();
  const x = await admitted(t, { cancel });
  let pending;
  await x.h.act(async () => {
    pending = x.api.cancel();
  });
  assert.equal(x.api.phase, 'idle');
  await x.h.act(async () => {
    cancel.resolve();
    await pending;
  });
  assert.equal(x.model.queue, 'cancelled');
  assert.equal(x.api.phase, 'idle');
  assert.deepEqual(names(x), ['cancel_meet_search']);
});

test('delayed join after Cancel does not restore searching', async (t) => {
  const join = deferred();
  const x = setup({ join });
  await x.h.mount();
  t.after(() => x.h.unmount());
  let start;
  await x.h.act(async () => {
    start = x.api.start(input);
  });
  await x.h.act(async () => {
    await x.api.cancel();
  });
  await x.h.act(async () => {
    join.resolve({ data: x.queued() });
    await start;
  });
  assert.equal(x.api.phase, 'idle');
  assert.ok(names(x).includes('cancel_meet_search') || names(x).includes('leave_meet_queue'));
});

test('repeated cancel is idempotent once the search id is cleared', async (t) => {
  const x = await admitted(t);
  await x.h.act(async () => {
    await x.api.cancel();
  });
  x.model.calls.length = 0;
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.deepEqual(names(x), ['leave_meet_queue']);
  assert.equal(x.api.phase, 'idle');
});

test('unauthorized / foreign queue id does not end a peer session', async (t) => {
  const x = await admitted(t);
  x.model.owner = 'peer';
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.equal(x.model.calls[0].name, 'cancel_meet_search');
  assert.equal(x.model.queue, 'waiting');
  assert.ok(x.api.notice || x.api.phase === 'idle');
});

test('unmount/account change during delayed Cancel makes no wrong-actor session write', async (t) => {
  const cancel = deferred();
  const x = await admitted(t, { cancel });
  let pending;
  await x.h.act(async () => {
    pending = x.api.cancel();
  });
  await x.h.unmount();
  x.model.actor = 'B';
  await x.h.act(async () => {
    cancel.resolve();
    await pending;
  });
  assert.equal(x.model.calls.every((c) => c.name !== 'join_meet_queue'), true);
  assert.equal(x.timers.size, 0);
});

test('new join, poll and next remain denied before transport can admit a match', async () => {
  const x = setup();
  await assert.rejects(x.actual.joinMeetQueue(input));
  await assert.rejects(x.actual.pollMeetQueue());
  await assert.rejects(x.actual.nextMeet('fictional-session', input));
  assert.deepEqual(x.model.calls, []);
});

test('cancelMeetSearch never invokes poll_meet_queue or join_meet_queue', async (t) => {
  const x = await admitted(t);
  x.match();
  await x.h.act(async () => {
    await x.api.cancel();
  });
  assert.equal(names(x).includes('poll_meet_queue'), false);
  assert.equal(names(x).includes('join_meet_queue'), false);
  assert.equal(x.model.active, false);
});

test('existing leave/report/block contracts remain reachable without admission', async () => {
  const x = setup();
  await x.actual.leaveMeetQueue();
  await x.actual.leaveMeetSession('fictional-session');
  await x.actual.reportMeetSession('fictional-session', 'other');
  await x.actual.blockMeetPeer('fictional-session');
  assert.deepEqual(names(x), [
    'leave_meet_queue',
    'leave_meet_session',
    'report_meet_session',
    'block_meet_peer',
  ]);
});
