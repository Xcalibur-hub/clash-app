import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabaseAuthStorageKey } from './supabaseEnv.ts';

test('disposable local origins cannot overwrite the existing development session', () => {
  const dev=supabaseAuthStorageKey('http://127.0.0.1:55321');
  assert.equal(dev,'sb-clash-local-auth-token');
  assert.notEqual(dev,supabaseAuthStorageKey('http://127.0.0.1:57721'));
  assert.notEqual(supabaseAuthStorageKey('http://127.0.0.1:57721'),supabaseAuthStorageKey('http://127.0.0.1:57731'));
  assert.equal(supabaseAuthStorageKey('http://127.0.0.1:57721/'),supabaseAuthStorageKey('http://127.0.0.1:57721'));
  assert.equal(supabaseAuthStorageKey('https://example.supabase.co'),'sb-clash-hosted-auth-token');
});
