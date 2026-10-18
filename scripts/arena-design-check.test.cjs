const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { render } = require('./arena-design-preview.cjs');

for (const scheme of ['dark', 'light']) for (const width of [320, 360, 430]) {
  test(`${scheme} ${width}dp: active route uses editorial hierarchy and one canonical challenge entry`, () => {
    const { markup } = render({ before: false, scheme, archived: false, width });
    assert.ok(markup.indexOf('The best technology') < markup.indexOf('Challenges'));
    assert.ok(markup.indexOf('Challenges') < markup.indexOf('>Discussion</'));
    assert.equal((markup.match(/aria-label="Challenge"/g) || []).length, 1);
    assert.ok(markup.includes('aria-label="View Clash history"'));
    assert.ok(markup.includes('aria-label="Show reply attachments"'));
    assert.ok(!markup.includes('aria-label="Send"'), 'empty collapsed composer has no dead send control');
    assert.ok(markup.includes('aria-label="Your perspective"'));
    assert.ok(!markup.includes('Where do you stand?'), 'voting remains behind an explicit disclosure');
  });
  test(`${scheme} ${width}dp: archived route retains discussion and history with no editable reply`, () => {
    const { markup } = render({ before: false, scheme, archived: true, width });
    assert.ok(markup.includes('Archived discussion'));
    assert.ok(markup.includes('Useful tools should'));
    assert.ok(markup.includes('View Clash history'));
    assert.ok(!markup.includes('textarea'));
    assert.ok(!markup.includes('aria-label="Challenge"'));
    assert.ok(!markup.includes('Challenge with this rebuttal'));
  });
}

test('320dp: focus expands actual composer into text, photo, video, GIF and send controls', () => {
  const { markup } = render({ before: false, scheme: 'dark', archived: false, width: 320, keyboard: true });
  for (const label of ['Attach photo', 'Attach video', 'Attach GIF', 'Send']) assert.ok(markup.includes(`aria-label="${label}"`), label);
  assert.ok(markup.includes('textarea'));
});

test('font scaling preserves complete editorial statement and accessible thread content', () => {
  const { markup, css } = render({ before: false, scheme: 'light', archived: false, width: 320, scale: 1.4 });
  assert.ok(markup.includes('The best technology gives us our attention back.'));
  assert.ok(markup.includes('Less friction, more intention.'));
  assert.match(markup + css, /font-size:32\.(?:2|1999[0-9]*)px/, 'actual 23dp statement scales to 140%');
});

test('all three button variants retain disabled and selected accessibility contracts', () => {
  render({ before: false, scheme: 'dark', archived: false, width: 360 });
  const { ArenaButton } = require('../components/arena/ui/ArenaPrimitives.tsx');
  for (const variant of ['primary', 'secondary', 'tertiary']) {
    const html = renderToStaticMarkup(React.createElement(ArenaButton, { label: variant, variant, disabled: true, selected: true, onPress() {} }));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(html.includes('aria-selected="true"'));
  }
});

test('metadata contrast is at least 4.5:1 against both page and raised surfaces', () => {
  const { arenaColors } = require('../theme/arena.ts');
  const { darkTheme, lightTheme } = require('../theme/palettes.ts');
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const theme of [darkTheme, lightTheme]) {
    const c = arenaColors(theme);
    for (const surface of [c.page, c.raised, c.inset]) {
      const l = [luminance(c.muted), luminance(surface)].sort((a, b) => b - a);
      assert.ok((l[0] + 0.05) / (l[1] + 0.05) >= 4.5, `${theme.scheme} ${surface}`);
    }
  }
});

test('reduced motion skips new layout transitions; normal motion uses the bounded 160ms convention', () => {
  const options = { before: false, scheme: 'dark', archived: false, width: 320 };
  assert.equal(render({ ...options, reduced: true }).motionCalls.length, 0);
  const enabled = render({ ...options, reduced: false });
  assert.ok(enabled.motionCalls.length >= 3);
  assert.ok(enabled.motionCalls.every(ms => ms === 160));
});
