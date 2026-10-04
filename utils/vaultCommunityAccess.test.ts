import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  communityAccessLabel,
  communityAccessRule,
  communityGateCopy,
} from './vaultCommunityAccess.ts';

describe('community access presentation', () => {
  it('labels the three access types', () => {
    assert.equal(communityAccessLabel('public'), 'Public');
    assert.equal(communityAccessLabel('followers'), 'Followers');
    assert.equal(communityAccessLabel('subscribers'), 'Subscribers');
    assert.equal(communityAccessLabel('unknown'), 'Public');
  });

  it('describes who may enter', () => {
    assert.equal(communityAccessRule('subscribers'), 'Open to active subscribers.');
    assert.equal(communityAccessRule('followers'), 'Open to followers of this creator.');
    assert.equal(communityAccessRule('public'), 'Open to anyone signed in.');
  });

  it('requires sign in before any access type', () => {
    const gate = communityGateCopy({
      access: 'followers',
      signedIn: false,
      following: false,
      subscribed: false,
      creatorName: 'Maya',
    });
    assert.equal(gate.action, 'signin');
  });

  it('asks the follower to follow first', () => {
    const gate = communityGateCopy({
      access: 'followers',
      signedIn: true,
      following: false,
      subscribed: false,
      creatorName: 'Aria',
    });
    assert.equal(gate.action, 'follow');
    assert.match(gate.body, /Follow Aria/);
  });

  it('asks the viewer to subscribe for a subscriber community', () => {
    const gate = communityGateCopy({
      access: 'subscribers',
      signedIn: true,
      following: true,
      subscribed: false,
      creatorName: 'Maya',
    });
    assert.equal(gate.action, 'subscribe');
  });

  it('offers enter when the viewer already qualifies', () => {
    const gate = communityGateCopy({
      access: 'public',
      signedIn: true,
      following: false,
      subscribed: false,
      creatorName: 'Leo',
    });
    assert.equal(gate.action, 'enter');
  });
});
