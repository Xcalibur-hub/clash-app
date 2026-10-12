// Offline upstream-parser comparison. Download the two pinned files separately; never runs the CLI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { frozenScan, normalize, sha256 } from './migration-encoding-check.cjs';
const directory = process.argv[2];
assert.ok(directory && process.argv.length === 3, 'Provide directory containing pinned migration-file.ts and sql-split.ts');
const hashes = {
  'migration-file.ts': 'ec8018d9c9ec4a3a60637ff2f386d7edb7b683d85dcbf56551b67e138c1a4cfe',
  'sql-split.ts': '005c59d49c164c72e60bbc9ab96b18bc7b811173b1702ded2e6bedabd2c688c0',
};
for (const [file, hash] of Object.entries(hashes))
  assert.equal(sha256(fs.readFileSync(path.join(directory, file))), hash, file + ': upstream hash mismatch');
const { parseMigrationContent } = await import(pathToFileURL(path.resolve(directory, 'migration-file.ts')).href);
const { files } = frozenScan();
for (const file of files) {
  const parsed = parseMigrationContent(file.bytes.toString('utf8'));
  assert.deepEqual(parsed, parseMigrationContent(normalize(file.bytes).toString('utf8')), file.path);
  assert.ok(parsed.statements.every(s => !s.startsWith('\ufeff')), file.path);
}
console.log(JSON.stringify({ upstream_tag: 'v2.120.0', upstream_commit: '753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4',
  files_equivalent: files.length, bom_files_equivalent: files.filter(f => f.leading_bom).length,
  parser_only: true, database_executed: false }));
