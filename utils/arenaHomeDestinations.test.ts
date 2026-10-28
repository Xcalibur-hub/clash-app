import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARENA_MODES } from './arenaNav.ts';
import {
  ARENA_HOME_PRIMARY_MODES,
  ARENA_HOME_ROUTE_DESTINATIONS,
  ARENA_NAV_DESTINATION_MAP,
  isArenaHomePrimaryMode,
  recalledArenaHomePrimaryMode,
  rememberArenaHomePrimaryMode,
  resetArenaHomePrimaryModeMemory,
  resolveArenaNavDestination,
} from './arenaHomeDestinations.ts';

describe('Arena Home destinations (UI-2A)', () => {
  it('keeps For You as the default Home mode', () => {
    resetArenaHomePrimaryModeMemory();
    assert.equal(recalledArenaHomePrimaryMode(), 'for_you');
  });

  it('exposes two Home chips and two existing stack routes', () => {
    assert.deepEqual(
      ARENA_HOME_PRIMARY_MODES.map((item) => item.id),
      ['for_you', 'clashes'],
    );
    assert.deepEqual(
      ARENA_HOME_PRIMARY_MODES.map((item) => item.label),
      ['For You', 'Live'],
    );
    assert.deepEqual(
      ARENA_HOME_ROUTE_DESTINATIONS.map((item) => [item.id, item.route]),
      [
        ['community', '/arena/crews'],
        ['topics', '/arena/topics'],
      ],
    );
  });

  it('maps every historical Home mode to a preserved destination', () => {
    assert.deepEqual(
      ARENA_MODES.map((item) => item.id),
      ['for_you', 'clashes', 'community', 'topics'],
    );
    assert.deepEqual(ARENA_NAV_DESTINATION_MAP.for_you, { kind: 'home_mode', mode: 'for_you' });
    assert.deepEqual(ARENA_NAV_DESTINATION_MAP.clashes, { kind: 'home_mode', mode: 'clashes' });
    assert.deepEqual(ARENA_NAV_DESTINATION_MAP.community, { kind: 'route', route: '/arena/crews' });
    assert.deepEqual(ARENA_NAV_DESTINATION_MAP.topics, { kind: 'route', route: '/arena/topics' });
    for (const item of ARENA_MODES) {
      assert.ok(resolveArenaNavDestination(item.id));
    }
    assert.equal(resolveArenaNavDestination('explore'), null);
  });

  it('remembers Live in memory without treating Groups as a Home chip', () => {
    resetArenaHomePrimaryModeMemory();
    rememberArenaHomePrimaryMode('clashes');
    assert.equal(recalledArenaHomePrimaryMode(), 'clashes');
    assert.equal(isArenaHomePrimaryMode('clashes'), true);
    assert.equal(isArenaHomePrimaryMode('community'), false);
    resetArenaHomePrimaryModeMemory();
    assert.equal(recalledArenaHomePrimaryMode(), 'for_you');
  });
});
