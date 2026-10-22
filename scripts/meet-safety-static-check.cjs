// File-only checks. Never opens a database; not a PostgreSQL parser or pgTAP run.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const migration = fs.readFileSync('supabase/migrations/20261022120000_meet_safety_and_lifecycle.sql', 'utf8');
const tests = fs.readFileSync('supabase/tests/097_meet_safety_and_lifecycle.sql', 'utf8');
let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log('PASS ' + label);
}

// Reject unterminated SQL strings/comments/dollar bodies and unbalanced outer
// parentheses. Function bodies are scanned separately. This is lexical only.
function balanced(source) {
  let i = 0, depth = 0;
  while (i < source.length) {
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i); i = end < 0 ? source.length : end + 1;
    } else if (source.startsWith('/*', i)) {
      let nesting = 1; i += 2;
      while (i < source.length && nesting) {
        if (source.startsWith('/*', i)) { nesting++; i += 2; }
        else if (source.startsWith('*/', i)) { nesting--; i += 2; }
        else i++;
      }
      assert.equal(nesting, 0, 'unterminated block comment');
    } else if (source[i] === "'" || source[i] === '"') {
      const quote = source[i++]; let closed = false;
      while (i < source.length) {
        if (source[i++] !== quote) continue;
        if (source[i] === quote) { i++; continue; }
        closed = true; break;
      }
      assert.ok(closed, 'unterminated quoted value');
    } else if (source[i] === '$' && /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(source.slice(i))) {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)[0];
      const start = i + tag.length, end = source.indexOf(tag, start);
      assert.notEqual(end, -1, 'unterminated dollar body');
      balanced(source.slice(start, end)); i = end + tag.length;
    } else {
      if (source[i] === '(') depth++;
      if (source[i] === ')') { depth--; assert.ok(depth >= 0, 'unmatched closing parenthesis'); }
      i++;
    }
  }
  assert.equal(depth, 0, 'unclosed parenthesis');
  return true;
}
check(balanced(migration), 'migration lexical delimiters balanced');
check(balanced(tests), 'pgTAP lexical delimiters balanced');
const functions = [...migration.matchAll(/create or replace function public\.(\w+)\b([\s\S]*?)as \$\$([\s\S]*?)\$\$;/gi)];
check(functions.length >= 15, 'migration function definitions discovered');
for (const [, name, header, body] of functions) {
  check(/security definer/i.test(header) && /set search_path = ''/i.test(header), name + ' pins definer search_path');
  check(new RegExp('revoke execute on function public\\.' + name + '\\(').test(migration), name + ' has explicit execute revocation');
  if (name === 'release_stale_meet_participation') check(/return new;/i.test(body), 'seat trigger returns inserted row');
}
check(!/grant\s+execute[\s\S]*?\bto\s+(?:public|anon)\s*;/i.test(migration), 'no public/anonymous execute grant');
check((migration.match(/'child_safety'/g) ?? []).length === 1, 'new enum value is not consumed in migration transaction');
check(/before insert on public\.meet_participants/i.test(migration), 'stale-seat trigger is BEFORE INSERT');
const sweep = functions.find(([, name]) => name === 'expire_stale_meet_sessions')[3];
check(/for update skip locked/i.test(sweep) && /limit greatest/i.test(sweep), 'expiry sweep locks with SKIP LOCKED and bounds batches');
check(/and s\.status = 'active'/i.test(sweep) && /left_at is null/i.test(sweep), 'expiry updates recheck active state and release seats');
const touch = functions.find(([, name]) => name === 'touch_meet_session')[3];
check(/for update of s/i.test(touch) && /v_expires <= now\(\)/i.test(touch), 'heartbeat locks session and rejects lapse');
check(/least\(now\(\) \+ interval '90 seconds', v_created \+ interval '6 hours'\)/i.test(touch), 'heartbeat applies server-owned six-hour cap');
const block = functions.find(([, name]) => name === 'block_meet_peer')[3];
check(block.indexOf('if not exists') < block.indexOf('select p.profile_id into v_peer'), 'block checks participation before peer lookup');
check(/session_id\s+text not null\s*,/i.test(migration), 'audit session ID has no inline foreign key');
check(/alter table public\.meet_moderation_reads enable row level security/i.test(migration) &&
  /for select using \(public\.is_staff\(\)\)/i.test(migration), 'audit table uses staff-only RLS');
const moderate = functions.find(([, name]) => name === 'moderate_meet_session')[3];
check(/if not public\.is_staff\(\)/i.test(moderate), 'evidence RPC checks staff authority');
check(!/from public\.meet_signals/i.test(moderate), 'evidence bundle does not select signaling');
for (const action of ['join','poll','session_read','message','message_read','leave','touch','block','report','signal','signal_read','moderate_read']) {
  check(new RegExp("assert_rate_limit\\(v_user, 'meet_" + action + "',").test(migration), 'rate limit present: meet_' + action);
}
const rate = fs.readFileSync('supabase/migrations/20261006150000_arena_correctness_foundation.sql', 'utf8');
check(/pg_advisory_xact_lock/.test(rate), 'rate-limit count/write uses existing transaction advisory lock');
check(/begin;[\s\S]*select no_plan\(\);[\s\S]*select finish\(\);\s*rollback;/i.test(tests), 'pgTAP uses transactional conventions');
check(/current_database\(\) !~ '\^clash_e325_/.test(tests) && /test\.e325_disposable/.test(tests), 'pgTAP rejects unapproved database targets');
check(!/dblink_connect[^;]*(?:postgres(?:ql)?:\/\/|hostaddr=)/i.test(tests) &&
  /host=\/var\/run\/postgresql dbname=%L/.test(tests), 'dblink targets only the current disposable database socket');
for (const marker of ['BEFORE INSERT releases','contending sweep skips','matching skips a locked',
  'audit survives permitted session deletion','expired active session rejects','cross-session evidence injection',
  'heartbeat number 121','second sweep is a no-op','populated peer reports']) {
  check(tests.includes(marker), 'executable assertion authored: ' + marker);
}
const assertionCount = (tests.match(/^select (?:ok|is|isnt|matches|has_function|has_table|lives_ok|throws_ok)\(/gm) ?? []).length;
console.log(JSON.stringify({ status: 'PASS', staticChecks: checks, authoredAssertions: assertionCount,
  databaseExecution: 'NOT EXECUTED', postgresSyntaxAndSemantics: 'NOT VERIFIED' }));
