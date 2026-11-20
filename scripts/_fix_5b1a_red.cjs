const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '_write_5b1a_red.cjs');
let s = fs.readFileSync(p, 'utf8');
if (s.endsWith('`);\n')) s = s.slice(0, -3) + '\n';
else if (s.includes("console.log('wrote', dest);\n`);")) {
  s = s.replace("console.log('wrote', dest);\n`);", "console.log('wrote', dest);");
}
fs.writeFileSync(p, s);
console.log('tail', JSON.stringify(s.slice(-30)));
