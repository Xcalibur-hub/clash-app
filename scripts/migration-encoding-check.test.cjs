const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspect, normalize, writeArtifact, sha256 } = require('./migration-encoding-check.cjs');
function removeTestDirectory(target) {
  assert.equal(path.dirname(path.resolve(target)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('clash-encoding-'));
  fs.rmSync(target, {recursive:true, force:true});
}
const bom = Buffer.from([0xef,0xbb,0xbf]);
const comment = Buffer.from("-- comment\r\nselect 'Unicode: \u00e9';\r\n");
test('clean UTF-8, CRLF and literal bytes stay identical', () => assert.deepEqual(normalize(comment), comment));
test('one file-start BOM before comment removes exactly three bytes', () => {
  const bytes = Buffer.concat([bom, comment]); assert.deepEqual(normalize(bytes), comment);
  assert.equal(inspect(bytes).bytes_removed, 3); assert.equal(inspect(bytes).crlf_count, 2);
});
for (const [name, bytes] of [
  ['invalid UTF-8', Buffer.from([0xc3,0x28])],
  ['UTF-16 LE', Buffer.from([0xff,0xfe,0x2d,0])],
  ['UTF-16 BE', Buffer.from([0xfe,0xff,0,0x2d])],
  ['UTF-32 LE', Buffer.from([0xff,0xfe,0,0,0x2d,0,0,0])],
  ['UTF-32 BE', Buffer.from([0,0,0xfe,0xff,0,0,0,0x2d])],
  ['NUL', Buffer.from('-- x\nselect\x00 1;')],
  ['duplicate BOM', Buffer.concat([bom,bom,comment])],
  ['embedded BOM', Buffer.from("-- x\nselect '\ufeff';")],
  ['BOM after whitespace', Buffer.concat([Buffer.from(' '),bom,comment])],
  ['leading NBSP', Buffer.from('\u00a0-- x')],
  ['leading zero-width space', Buffer.from('\u200b-- x')],
  ['control byte', Buffer.from('-- x\x01')],
  ['BOM before executable token', Buffer.concat([bom,Buffer.from('select 1;')])],
]) test('rejects ' + name, () => assert.throws(() => normalize(bytes)));
test('mojibake heuristic warns but does not rewrite valid Unicode', () => {
  const bytes = Buffer.from('-- \u00e2\u20ac\u201d\nselect 1;');
  assert.equal(inspect(bytes).possible_mojibake_sequences,1);assert.deepEqual(normalize(bytes),bytes);
});
test('artifact writes verified bytes and refuses existing destination without overwriting', () => {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'clash-encoding-'));
  try {
    const destination=path.join(parent,'artifact'); const bytes=Buffer.concat([bom,comment]);
    const entry={path:'supabase/migrations/20261003180000_sample.sql',bytes,artifact_sha256:sha256(comment)};
    writeArtifact(destination,[entry],{sql_executed:false});
    const file=path.join(destination,'migrations','20261003180000_sample.sql');
    assert.deepEqual(fs.readFileSync(file),comment);
    assert.throws(()=>writeArtifact(destination,[entry],{}));assert.deepEqual(fs.readFileSync(file),comment);
  } finally { removeTestDirectory(parent); }
});
test('unsafe artifact input creates no destination', () => {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'clash-encoding-'));
  try {
    const target=path.join(parent,'artifact');
    assert.throws(()=>writeArtifact(target,[{path:'x.sql',bytes:Buffer.from([0xff])}],{}));
    assert.equal(fs.existsSync(target),false);
  } finally { removeTestDirectory(parent); }
});
