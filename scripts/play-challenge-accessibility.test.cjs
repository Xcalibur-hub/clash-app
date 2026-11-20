'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs
  .readFileSync(path.join(__dirname, '..', 'app', 'explore', 'challenge', '[id].tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

test('challenge detail Back style is at least 44dp', () => {
  const from = source.indexOf('back: {');
  const to = source.indexOf('backLabel:', from);
  assert.ok(from >= 0 && to > from, 'back style block');
  const block = source.slice(from, to);
  assert.match(block, /width:\s*44/);
  assert.match(block, /height:\s*44/);
  assert.doesNotMatch(block, /width:\s*40/);
  assert.doesNotMatch(block, /height:\s*40/);
});

test('challenge detail exposes Join and missing-state Back contracts', () => {
  assert.match(source, /accessibilityLabel="Back"/);
  assert.match(source, /Join challenge/);
  assert.match(source, /joinChallenge\(/);
  assert.match(source, /submitChallengeEntry\(/);
  assert.match(source, /Challenge not found|challenge not found/);
});
