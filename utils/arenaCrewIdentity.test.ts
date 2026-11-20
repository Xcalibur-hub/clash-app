import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crewCrestInitials } from './arenaCrewIdentity.ts';

describe('crew crest initials', () => {
  it('uses one initial for a one-word Crew and two for a multiword Crew', () => {
    assert.equal(crewCrestInitials('Droid'), 'D');
    assert.equal(crewCrestInitials('Byte Club'), 'BC');
  });
});
