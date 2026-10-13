/* S6 — Explore RPC contract parity.
 *
 * Compares the fields the Explore service mappers actually read with the fields the EFFECTIVE SQL
 * function returns. The effective definition is the LAST `create or replace` for a function, which
 * matters here: `get_explore_world_summary` is defined twice (`20261003180000`, then
 * `20261003190000`), so only the later body is the contract the app depends on.
 *
 * Why a static checker: there are no generated runtime types, and every Explore mapper drops a row
 * whose required key is missing. A renamed SQL alias therefore degrades the UI silently instead of
 * failing anywhere. This check turns that drift into a build-time failure.
 *
 * Output keys are derived from the three shapes the migrations actually use:
 *   1. `jsonb_build_object('key', …)`  → 'key'
 *   2. `… as "quotedKey"`              → quotedKey
 *   3. select lists whose output names become row_to_json keys (plain or aliased columns)
 * Bare columns (`select id, title …`) ARE captured: turning one into a quoted alias while the
 * mapper still reads `title` is exactly the silent drift this check exists to catch.
 */
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations');
const SERVICE_FILE = path.resolve(__dirname, '..', 'services', 'exploreService.ts');

/** RPCs the Explore service calls, and the source slices that read each payload. */
const RPC_CONTRACTS = {
  get_explore_world_summary: { slices: ['fetchExploreWorldSummary', 'toChallenge', 'toTreasure'] },
  get_explore_country: { slices: ['fetchExploreCountry', 'toChallenge', 'toTreasure', 'toVaultPreview'] },
  get_global_viral: { slices: ['fetchGlobalViral'] },
  list_explore_vault_previews: { slices: ['toVaultPreview'] },
  get_explore_for_you: { slices: ['fetchExploreForYou', 'toForYouItem'] },
  get_explore_live: { slices: ['fetchExploreLive'] },
  get_teleport_candidate: { slices: ['fetchTeleportCandidate'] },
  search_explore: { slices: ['searchExplore', 'toVaultPreview'] },
};

/** Every migration in filename order — the order Postgres applies them in. */
function loadMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/** All `create or replace function public.<name>(` definitions, in migration order. */
function findDefinitions(name, migrations = loadMigrations()) {
  const found = [];
  const needle = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i');
  for (const migration of migrations) {
    const lines = migration.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!needle.test(lines[i])) continue;
      let end = i;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/\$\$\s*;/.test(lines[j])) { end = j; break; }
      }
      found.push({ file: migration.name, line: i + 1, body: lines.slice(i, end + 1).join('\n') });
    }
  }
  return found;
}

/** The last definition wins — that is the one Postgres keeps. */
function effectiveDefinition(name, migrations = loadMigrations()) {
  const definitions = findDefinitions(name, migrations);
  return definitions.length ? { ...definitions[definitions.length - 1], all: definitions } : null;
}

/** Output names from a select list: plain columns, `col as name`, `col as "quotedName"`. */
function selectOutputNames(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  parts.push(current);

  const names = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const quoted = part.match(/\bas\s+"([A-Za-z_][A-Za-z0-9_]*)"/);
    if (quoted) { names.push(quoted[1]); continue; }
    const plainAlias = part.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (plainAlias) { names.push(plainAlias[1]); continue; }
    const qualified = part.match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/);
    if (qualified) { names.push(qualified[0].split('.').pop()); continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) names.push(part);
  }
  return names;
}

/** Every output key the effective body can produce. */
function extractOutputKeys(body) {
  const keys = new Set();

  // 1. jsonb_build_object('key', …) — the shape most Explore RPCs use.
  const buildObject = /jsonb_build_object\s*\(/gi;
  let match = buildObject.exec(body);
  while (match) {
    const from = match.index + match[0].length;
    const window = body.slice(from, from + 4000);
    for (const key of window.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'\s*,/g)) keys.add(key[1]);
    match = buildObject.exec(body);
  }

  // 2. Quoted aliases, used where a row is projected with row_to_json.
  for (const alias of body.matchAll(/\bas\s+"([A-Za-z_][A-Za-z0-9_]*)"/g)) keys.add(alias[1]);

  // 3. Select lists that feed row_to_json / jsonb_agg: capture their plain output names too.
  const selectList = /\bselect\s+([\s\S]*?)\s+\bfrom\b/gi;
  let list = selectList.exec(body);
  while (list) {
    const names = selectOutputNames(list[1]);
    const isProjection = /\bas\s+"/.test(list[1]) || names.length > 1;
    if (isProjection) for (const name of names) keys.add(name);
    list = selectList.exec(body);
  }

  for (const noise of ['create', 'select', 'from', 'where', 'into', 'values', 'declare', 'begin']) {
    keys.delete(noise);
  }
  return keys;
}

/** The payload keys a mapper reads: `r.x`, `r?.x`, `record.x`, `candidate.x`. */
const READ_PATTERN = /(?:\br\b|\brecord\b|\bcandidate\b)\??\.([A-Za-z_][A-Za-z0-9_]*)/g;

/** One named function's body: from its declaration line to the next declaration at line start. */
function sourceSlice(source, name) {
  const lines = source.split(/\r?\n/);
  const declaration = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+' + name + '\\s*[({]');
  const anyDeclaration = /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_]/;
  const start = lines.findIndex((line) => declaration.test(line));
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && !anyDeclaration.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n');
}

/** Conditions of `if (...)` blocks that drop the row (`return`/`continue` inside). */
function guardConditions(body) {
  const conditions = [];
  const opener = /\bif\s*\(/g;
  let match = opener.exec(body);
  while (match) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < body.length && depth > 0) {
      const char = body[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    const condition = body.slice(start, index - 1);
    const after = body.slice(index, index + 160);
    if (/\breturn\b|\bcontinue\b/.test(after)) conditions.push(condition);
    match = opener.exec(body);
  }
  return conditions;
}

/**
 * Required vs optional payload keys in one mapper slice.
 *
 * REQUIRED means "if this key is missing or renamed, the row is dropped or the payload silently
 * becomes empty" — the drift this check exists to catch:
 *   · a key assigned to a local that is used in a guard that drops the row
 *     (`const id = str(r.id); if (!id || !title) return null;` → id, title)
 *   · a key used inside a guard condition (`!isExploreVaultVisible({ accessLevel, publicMediaPath })`)
 *   · the response envelope read as `record.<key>` (`record.items`, `record.challenges`, …)
 * OPTIONAL means the mapper has an explicit fallback (`str(r.authorHandle) ?? str(r.creatorHandle)`,
 * `num(r.score) ?? 0`), so its absence changes a value but never loses the row.
 */
function sliceRequirements(body) {
  const required = new Set();
  const optional = new Set();

  // Local variable → payload key, so a guard on the variable can be traced back to the key.
  const varToKey = new Map();
  for (const assignment of body.matchAll(/(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;\n]*)/g)) {
    const read = assignment[2].match(/(?:\br\b|\brecord\b|\bcandidate\b)\??\.([A-Za-z_][A-Za-z0-9_]*)/);
    if (read) varToKey.set(assignment[1], read[1]);
  }

  // Every payload read, for the optional set and the report.
  for (const read of body.matchAll(READ_PATTERN)) optional.add(read[1]);

  // Identifiers inside a guard condition: these are the drop/deny decisions. Both
  // `!id` and `endsAt == null` styles are covered, because both drop the row.
  for (const condition of guardConditions(body)) {
    for (const identifier of condition.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const key = varToKey.get(identifier[0]);
      if (key) required.add(key);
    }
  }

  // The response envelope: an absent container silently empties a whole section.
  for (const container of body.matchAll(/(?:\brecord\b)\??\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    required.add(container[1]);
  }

  for (const key of required) optional.delete(key);
  return { required, optional, varToKey };
}
/** Required and optional keys per RPC, read from the service source so the two cannot drift apart. */
function readContractKeys(serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8')) {
  const required = {};
  const optional = {};
  for (const [rpc, { slices }] of Object.entries(RPC_CONTRACTS)) {
    const need = new Set();
    const tolerate = new Set();
    for (const slice of slices) {
      const body = sourceSlice(serviceSource, slice);
      if (!body) continue;
      const requirements = sliceRequirements(body);
      for (const key of requirements.required) need.add(key);
      for (const key of requirements.optional) tolerate.add(key);
    }
    required[rpc] = [...need].sort();
    optional[rpc] = [...tolerate].sort();
  }
  return { required, optional };
}

/** Required keys per RPC (kept as its own export: the parity assertion uses only these). */
function requiredKeys(serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8')) {
  return readContractKeys(serviceSource).required;
}

/** Keys the mappers read but tolerate missing, because they carry an explicit fallback. */
function optionalKeys(serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8')) {
  return readContractKeys(serviceSource).optional;
}

/** The parity result: per RPC, which required keys the effective SQL does not provide. */
function checkParity(options = {}) {
  const migrations = options.migrations ?? loadMigrations();
  const serviceSource = options.serviceSource ?? fs.readFileSync(SERVICE_FILE, 'utf8');
  const { required, optional } = readContractKeys(serviceSource);
  const report = {};
  for (const rpc of Object.keys(RPC_CONTRACTS)) {
    const effective = effectiveDefinition(rpc, migrations);
    if (!effective) {
      report[rpc] = { ok: false, reason: 'no definition found', missing: required[rpc], available: [] };
      continue;
    }
    const available = [...extractOutputKeys(effective.body)].sort();
    const missing = required[rpc].filter((key) => !available.includes(key));
    report[rpc] = {
      ok: missing.length === 0,
      effective: `${effective.file}:${effective.line}`,
      superseded: effective.all.length > 1 ? effective.all.slice(0, -1).map((d) => `${d.file}:${d.line}`) : [],
      required: required[rpc],
      optional: optional[rpc],
      missing,
      available,
    };
  }
  return { ok: Object.values(report).every((entry) => entry.ok), report };
}

module.exports = {
  MIGRATIONS_DIR, RPC_CONTRACTS, SERVICE_FILE, checkParity, effectiveDefinition, extractOutputKeys,
  findDefinitions, loadMigrations, optionalKeys, requiredKeys, selectOutputNames, sliceRequirements,
  sourceSlice,
};

if (require.main === module) {
  const { ok, report } = checkParity();
  const dump = process.argv.includes('--dump');
  for (const [rpc, entry] of Object.entries(report)) {
    process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${rpc} (${entry.effective ?? entry.reason})\n`);
    if (entry.superseded?.length) process.stdout.write(`     superseded: ${entry.superseded.join(', ')}\n`);
    if (!entry.ok) process.stdout.write(`     missing:    ${entry.missing.join(', ')}\n`);
    if (dump) {
      process.stdout.write(`     required:   ${entry.required.join(', ')}\n`);
      process.stdout.write(`     available:  ${entry.available.join(', ')}\n`);
    }
  }
  process.stdout.write(`${ok ? 'RPC contract parity OK' : 'RPC contract parity FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}
