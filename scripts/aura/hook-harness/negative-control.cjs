/*
 * Negative control for the mounted-hook suite.
 *
 * A green suite proves nothing until it has been shown to go red for a broken
 * implementation. This runner bundles the *same* tests against deliberately
 * broken sources and asserts the outcome:
 *
 *   1. the unmodified suite passes;
 *   2. removing the post-admission refresh calls from `watchAsSpectator` makes
 *      it fail — that is the regression the suite exists to catch;
 *   3. the fake-server properties the suite leans on (array pages, a real
 *      membership insert, a real 42501 refusal) are each load-bearing: degrade
 *      one and the suite fails.
 *
 * Every mutation is an exact, counted string edit inside a named scope. If an
 * anchor stops matching, the run fails instead of silently reporting a mutant
 * that never existed — a blind replace that no-ops would otherwise "kill" a
 * mutation that was never applied. Mutants are served from memory, so the
 * working tree is never modified.
 *
 * Run with: node scripts/aura/hook-harness/negative-control.cjs
 */
const fs = require('fs');
const path = require('path');
const { runSuite, ROOT, REAL_HOOK, REAL_FAKES } = require('./build.cjs');

const MUTANT_OUT = path.join(ROOT, '.aura-hook-harness-mutant.cjs');

/** `watchAsSpectator`'s callback, where the post-admission refreshes live. */
const WATCH_SCOPE = {
  start: 'const watchAsSpectator = React.useCallback(',
  end: '}, [load, notify, refreshThread, roomId, liveSession]);',
};

const MUTATIONS = [
  {
    id: 'H1',
    title: 'hook: both post-admission refreshes removed',
    target: 'hook',
    scope: WATCH_SCOPE,
    edits: [
      { name: 'refreshThread call', find: 'await refreshThread(session);', replace: '', expect: 1 },
      { name: 'load refresh call', find: "await load('refresh', session);", replace: '', expect: 1 },
    ],
    expectation: 'kill',
    covers: [/SETTLED DUEL: Watch admits/, /PAGINATION/],
  },
  {
    id: 'H2',
    title: 'hook: only load("refresh") removed',
    target: 'hook',
    scope: WATCH_SCOPE,
    edits: [
      { name: 'load refresh call', find: "await load('refresh', session);", replace: '', expect: 1 },
    ],
    expectation: 'kill',
    covers: [/SETTLED DUEL: Watch admits/],
  },
  {
    id: 'H3',
    title: 'hook: only refreshThread removed (diagnostic)',
    target: 'hook',
    scope: WATCH_SCOPE,
    edits: [
      { name: 'refreshThread call', find: 'await refreshThread(session);', replace: '', expect: 1 },
    ],
    expectation: 'report',
  },
  {
    id: 'F1',
    title: 'fake: page returns an object, not an array',
    target: 'fakes',
    edits: [
      { name: 'page return', find: '    return rows;', replace: '    return { rows };', expect: 1 },
    ],
    expectation: 'kill',
    covers: [/SETTLED DUEL: Watch admits/],
  },
  {
    id: 'F2',
    title: 'fake: watch writes no membership row',
    target: 'fakes',
    edits: [
      {
        name: 'membership insert',
        find: "  state.members.get(roomId).set(PROFILE, { role: 'spectator', stance: null, joinedAt });",
        replace: '  /* mutation: no membership written */',
        expect: 1,
      },
    ],
    expectation: 'kill',
    covers: [/SETTLED DUEL: Watch admits/],
  },
  {
    id: 'F3',
    title: 'fake: reads never refuse a non-member',
    target: 'fakes',
    edits: [
      {
        name: 'membership refusal',
        find: 'if (!isMember(roomId)) throw refusal();',
        replace: 'void refusal;',
        expect: 1,
      },
    ],
    expectation: 'kill',
    covers: [/SETTLED DUEL: Watch admits/],
  },
];

function fail(message) {
  console.error(`negative control: ${message}`);
  process.exit(1);
}

/** Apply counted edits, optionally inside a named scope. */
function mutate(source, mutation) {
  let head = '';
  let body = source;
  let tail = '';
  if (mutation.scope) {
    const start = source.indexOf(mutation.scope.start);
    if (start < 0) fail(`${mutation.id}: scope start not found`);
    const end = source.indexOf(mutation.scope.end, start);
    if (end < 0) fail(`${mutation.id}: scope end not found`);
    head = source.slice(0, start);
    body = source.slice(start, end);
    tail = source.slice(end);
  }
  for (const edit of mutation.edits) {
    const found = body.split(edit.find).length - 1;
    if (found !== edit.expect) {
      fail(
        `${mutation.id}: anchor "${edit.name}" matched ${found} times, expected ${edit.expect}. ` +
          'Refusing to report a mutation that was not applied.',
      );
    }
    body = body.split(edit.find).join(edit.replace);
  }
  return head + body + tail;
}

function counts(output) {
  const pass = /^# pass (\d+)$/m.exec(output);
  const failures = /^# fail (\d+)$/m.exec(output);
  return {
    pass: pass ? Number(pass[1]) : null,
    fail: failures ? Number(failures[1]) : null,
  };
}

function failingTests(output) {
  return output
    .split('\n')
    .filter((line) => line.startsWith('not ok - '))
    .map((line) => line.slice('not ok - '.length).trim());
}

async function run() {
  /* --- 1. Baseline ------------------------------------------------------ */
  process.stdout.write('baseline: unmodified sources\n');
  const baseline = await runSuite({ outfile: path.join(ROOT, '.aura-hook-harness.cjs') });
  const baseCounts = counts(baseline.output);
  if (baseline.status !== 0 || baseCounts.fail !== 0) {
    process.stdout.write(baseline.output);
    fail('the unmodified suite does not pass, so mutation results would mean nothing');
  }
  process.stdout.write(`baseline: pass ${baseCounts.pass}, fail ${baseCounts.fail}\n\n`);

  /* --- 2. Mutations ----------------------------------------------------- */
  const rows = [];
  let problems = 0;

  for (const mutation of MUTATIONS) {
    const sourcePath = mutation.target === 'hook' ? REAL_HOOK : REAL_FAKES;
    const original = fs.readFileSync(sourcePath, 'utf8');
    const mutated = mutate(original, mutation);
    if (mutated === original) fail(`${mutation.id}: mutation produced identical source`);

    /*
     * The mutant is supplied as source text and served from a virtual namespace;
     * nothing is written into the working tree, so an interrupted run cannot
     * leave a broken hook beside the real one.
     */
    let result;
    try {
      result = await runSuite({
        outfile: MUTANT_OUT,
        hookOverride: mutation.target === 'hook' ? mutated : null,
        fakesOverride: mutation.target === 'fakes' ? mutated : null,
      });
    } catch (error) {
      /* A mutant that does not build proves nothing; say so instead of crashing. */
      fail(`${mutation.id}: the mutant did not build — ${error && error.message ? error.message : error}`);
    }

    const mutantCounts = counts(result.output);
    const failing = failingTests(result.output);
    const killed = mutantCounts.fail !== null && mutantCounts.fail > 0;

    let verdict;
    if (mutation.expectation === 'kill') {
      const covered =
        mutation.covers.length > 0 &&
        mutation.covers.every((pattern) => failing.some((name) => pattern.test(name)));
      if (killed && covered) {
        verdict = 'killed';
      } else {
        verdict = killed ? 'killed (wrong test)' : 'SURVIVED';
        problems += 1;
      }
    } else {
      verdict = killed ? 'killed' : 'survived';
    }

    rows.push({
      id: mutation.id,
      title: mutation.title,
      expectation: mutation.expectation,
      verdict,
      fail: mutantCounts.fail,
      failing,
    });

    if (process.env.AURA_MUTATION_VERBOSE === '1' && killed) {
      process.stdout.write(`${mutation.id} failing tests:\n${failing.map((n) => `  · ${n}`).join('\n')}\n`);
    }
  }

  fs.rmSync(MUTANT_OUT, { force: true });

  /* --- 3. Report -------------------------------------------------------- */
  const width = Math.max(...rows.map((row) => row.title.length));
  process.stdout.write('\nmutation results\n');
  for (const row of rows) {
    process.stdout.write(
      `  ${row.id}  ${row.title.padEnd(width)}  ${row.verdict.padEnd(17)}` +
        `  fail ${row.fail === null ? '?' : row.fail}` +
        `${row.failing.length ? `  (${row.failing[0]})` : ''}\n`,
    );
  }

  const h3 = rows.find((row) => row.id === 'H3');
  process.stdout.write(
    '\n  H3 is diagnostic: with the initial mount read refused, the hook has no message\n' +
      '  cursor, so `refreshThread` finds nothing to drain and `load("refresh")` does the\n' +
      '  publish. Its survival is reported, not hidden — see the harness notes.\n',
  );

  if (problems > 0) {
    fail(`${problems} required mutation(s) did not fail the suite`);
  }
  process.stdout.write('\nnegative control: PASS — baseline green, every required mutation killed\n');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
