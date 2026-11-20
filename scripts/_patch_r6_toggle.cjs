const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.integration.test.ts');
let s = fs.readFileSync(file, 'utf8');
const from = `toggle: async (id, emoji) => {
      const prior = store.getSnapshot().find((item) => item.id === id)
        ?.reactions.find((r) => r.emoji === emoji);
      const reacted = !prior?.viewerReacted;
      const count = reacted ? (prior?.count ?? 0) + 1 : Math.max(0, (prior?.count ?? 1) - 1);
      return { messageId: id, emoji, reacted, count };
    },`;
const to = `toggle: async (id, emoji) => ({ messageId: id, emoji, reacted: true, count: 1 }),`;
if (!s.includes(from)) {
  console.error('toggle block not found');
  process.exit(1);
}
fs.writeFileSync(file, s.replace(from, to));
console.log('patched r6 toggle');
