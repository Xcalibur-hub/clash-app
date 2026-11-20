const fs = require('fs');
const p = require('path').join(__dirname, '_write_5b1a_red.cjs');
let s = fs.readFileSync(p, 'utf8');
const marker = "console.log('wrote', dest);";
const idx = s.lastIndexOf(marker);
if (idx < 0) throw new Error('marker missing');
// Ensure writeFileSync template is closed before the log line.
const before = s.slice(0, idx);
const closed = before.endsWith('`);\n') || before.endsWith('`);\r\n') || before.trimEnd().endsWith('`);');
s = (closed ? before : before.replace(/\s*$/, '') + '\n`);\n') + marker + '\n';
fs.writeFileSync(p, s);
try {
  require(p);
  console.log('write script ran ok');
} catch (e) {
  console.error('still broken', e.message);
  process.exit(1);
}
