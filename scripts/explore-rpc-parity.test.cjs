/* S6 — the RPC contract-parity checker must fail when a required alias drifts.
 *
 * Every case mutates a copy of the migration text in memory; the repository files are never touched.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  checkParity, effectiveDefinition, findDefinitions, loadMigrations, optionalKeys, requiredKeys,
} = require('./explore-rpc-parity.cjs');

const MIGRATIONS = loadMigrations();
const WORLD = '20261003190000_explore_vault_preview.sql';
const WORLD_SUPERSEDED = '20261003180000_explore_global.sql';

/** Applies a text mutation to one migration and re-runs the whole parity check.
 *  The mutation must actually change the text, so a test can never pass on a no-op. */
function parityWith(file, mutate) {
  let changed = false;
  const mutated = MIGRATIONS.map((migration) => {
    if (migration.name !== file) return migration;
    const text = mutate(migration.text);
    assert.notEqual(text, migration.text, `mutation of ${file} changed nothing`);
    changed = true;
    return { ...migration, text };
  });
  assert.equal(changed, true, `no migration named ${file}`);
  return checkParity({ migrations: mutated });
}

test('the committed migrations satisfy Explore contract parity', () => {
  const { ok, report } = checkParity({ migrations: MIGRATIONS });
  const failed = Object.entries(report).filter(([, entry]) => !entry.ok).map(([rpc]) => rpc);
  assert.deepEqual(failed, [], `unexpected parity failures: ${failed.join(', ')}`);
  assert.equal(ok, true);
  assert.equal(Object.keys(report).length, 8, 'every RPC the service calls is checked');
  for (const entry of Object.values(report)) {
    assert.equal(entry.missing.length, 0);
    assert.equal(entry.required.length > 0, true, 'each RPC has at least one required key');
  }
});

test('a superseded definition is resolved to the effective (last) one', () => {
  const definitions = findDefinitions('get_explore_world_summary', MIGRATIONS);
  assert.equal(definitions.length, 2, 'the summary is defined twice');
  assert.match(definitions[0].file, /20261003180000/);
  assert.match(definitions[1].file, /20261003190000/);
  const effective = effectiveDefinition('get_explore_world_summary', MIGRATIONS);
  assert.equal(effective.file, WORLD);
  assert.equal(effective.line, 508);

  // Mutating the SUPERSEDED body must not change the verdict: it is not the contract any more.
  const stale = ['20261003180000_explore_global.sql'];
  assert.equal(stale.includes(WORLD), false);
  const { ok } = parityWith(WORLD_SUPERSEDED, (text) => text.replaceAll("'score'", "'stale_score'"));
  assert.equal(ok, true, 'the older definition is not the contract');

  // Mutating the EFFECTIVE body fails, and names the field.
  const drifted = parityWith(WORLD, (text) => text.replaceAll('"endsAt"', '"ends_at"'));
  assert.equal(drifted.ok, false);
  assert.ok(drifted.report.get_explore_world_summary.missing.includes('endsAt'));
  assert.match(drifted.report.get_explore_world_summary.effective, /20261003190000/);
});

test('a renamed or removed required alias fails the check for that RPC', () => {
  const renames = [
    [WORLD, '"endsAt"', '"ends_at"', 'get_explore_world_summary', 'endsAt'],
    [WORLD, ' clue,', ' riddle,', 'get_explore_world_summary', 'clue'],
    [WORLD, "'dropId'", "'drop_id'", 'list_explore_vault_previews', 'dropId'],
    [WORLD, "'publicMediaPath'", "'public_media'", 'list_explore_vault_previews', 'publicMediaPath'],
    [WORLD, "'candidate'", "'pick'", 'get_teleport_candidate', 'candidate'],
    [WORLD, "'items'", "'rows'", 'get_global_viral', 'items'],
    ['20261003200000_explore_for_you_ia.sql', "'nextCursor'", "'next_cursor'", 'get_explore_for_you', 'nextCursor'],
    ['20261003200000_explore_for_you_ia.sql', "'takes'", "'clips'", 'get_explore_live', 'takes'],
    ['20261003200000_explore_for_you_ia.sql', "'hoods'", "'neighbourhoods'", 'search_explore', 'hoods'],
    [WORLD, "'vaultPreviews'", "'vault_previews'", 'get_explore_country', 'vaultPreviews'],
  ];
  for (const [file, from, to, rpc, key] of renames) {
    const { ok, report } = parityWith(file, (text) => text.replaceAll(from, to));
    assert.equal(ok, false, `${file}: renaming ${from} must fail the check`);
    assert.ok(
      report[rpc].missing.includes(key),
      `${rpc} must report the missing ${key}, saw [${report[rpc].missing.join(', ')}]`,
    );
  }
});

test('deleting a required alias entirely also fails', () => {
  // A deletion, not a rename: the column stays but its camelCase alias is gone.
  const { ok, report } = parityWith(WORLD, (text) => text.replaceAll('ends_at as "endsAt"', 'ends_at'));
  assert.equal(ok, false);
  assert.ok(report.get_explore_world_summary.missing.includes('endsAt'));
  assert.equal(report.get_explore_world_summary.available.includes('endsAt'), false);
});

test('an optional key with a fallback does not fail the check', () => {
  const required = requiredKeys();
  const optional = optionalKeys();
  assert.equal(required.list_explore_vault_previews.includes('authorHandle'), false);
  assert.equal(optional.list_explore_vault_previews.includes('authorHandle'), true);
  assert.equal(optional.list_explore_vault_previews.includes('authorName'), true);
  assert.equal(required.list_explore_vault_previews.includes('dropId'), true);

  // Each of these degrades a VALUE (fallback applied) rather than dropping the row, so renaming
  // it must not fail parity — but it must be recorded as optional, never silently ignored.
  const tolerant = [
    [WORLD, '"challengeType"', '"challenge_type"', 'get_explore_world_summary', 'challengeType'],
    [WORLD, '"giftsRemaining"', '"gifts_left"', 'get_explore_world_summary', 'giftsRemaining'],
    [WORLD, '"rewardType"', '"reward_kind"', 'get_explore_world_summary', 'rewardType'],
    [WORLD, "'authorTint'", "'author_tint'", 'list_explore_vault_previews', 'authorTint'],
  ];
  for (const [file, from, to, rpc, key] of tolerant) {
    const { ok, report } = parityWith(file, (text) => text.replaceAll(from, to));
    assert.equal(ok, true, `${rpc}: ${key} has a fallback, so renaming it is tolerated`);
    assert.equal(report[rpc].optional.includes(key), true, `${key} must still be recorded as optional`);
  }
});
