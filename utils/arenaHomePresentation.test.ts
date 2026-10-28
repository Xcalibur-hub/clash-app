/**
 * UI Phase 4 — Arena Home / Fresh Takes presentation contracts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ARENA_FRESH_STAGE_COMPACT_WIDTH,
  ARENA_FRESH_STAGE_HEIGHT,
  ARENA_HOME_FIRST_VIEWPORT,
  arenaFreshStageHeight,
  arenaLiveGatewayCopy,
} from './arenaHomePresentation.ts';
import {
  arenaFlatListData,
  shouldShowArenaFeedEmpty,
} from './arenaFeedSurface.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

describe('UI Phase 4 Arena Home presentation', () => {
  it('orders the For You first viewport: live → fresh takes → scopes → feed', () => {
    assert.deepEqual([...ARENA_HOME_FIRST_VIEWPORT], [
      'live_gateway',
      'fresh_takes',
      'feed_scopes',
      'take_feed',
    ]);
    const home = read('app/(tabs)/index.tsx');
    const liveAt = home.indexOf('<ArenaLiveGateway');
    const freshAt = home.indexOf('<FreshTakesSection');
    const scopesAt = home.indexOf('<ArenaDiscoveryRail');
    assert.ok(liveAt > 0 && freshAt > liveAt && scopesAt > freshAt);
    assert.doesNotMatch(home, /THE CONVERSATION/);
    assert.doesNotMatch(home, /A fresh perspective\./);
    assert.match(home, /YOUR FEED · 24H/);
  });

  it('sizes Fresh Takes stage for A50-class widths without burying the feed', () => {
    assert.equal(arenaFreshStageHeight(360), ARENA_FRESH_STAGE_HEIGHT.compact);
    assert.equal(arenaFreshStageHeight(412), ARENA_FRESH_STAGE_HEIGHT.regular);
    assert.ok(ARENA_FRESH_STAGE_HEIGHT.compact < ARENA_FRESH_STAGE_HEIGHT.regular);
    assert.ok(ARENA_FRESH_STAGE_HEIGHT.compact < 440);
    assert.equal(ARENA_FRESH_STAGE_COMPACT_WIDTH, 380);
    const stage = read('components/arena/FreshTakesStage.tsx');
    assert.match(stage, /arenaFreshStageHeight/);
    assert.doesNotMatch(stage, /STAGE_H = 440/);
  });

  it('keeps live gateway honest about counts and labeling', () => {
    assert.deepEqual(arenaLiveGatewayCopy(2), {
      title: 'Live Clashes',
      subtitle: '2 live discussions · tap to watch',
      live: true,
    });
    assert.deepEqual(arenaLiveGatewayCopy(1), {
      title: 'Live Clashes',
      subtitle: '1 live discussion · tap to watch',
      live: true,
    });
    assert.equal(arenaLiveGatewayCopy(null).live, false);
    assert.equal(arenaLiveGatewayCopy(0).live, false);
    const gateway = read('components/arena/ArenaLiveGateway.tsx');
    assert.match(gateway, /arenaLiveGatewayCopy/);
    assert.match(gateway, /LIVE/);
    assert.doesNotMatch(gateway, /urgent|trending now|everyone is watching/i);
  });

  it('preserves Fresh Takes actions and feed filter contracts', () => {
    const section = read('components/arena/FreshTakesSection.tsx');
    assert.match(section, /onOpen/);
    assert.match(section, /onClash/);
    assert.match(section, /onReact/);
    assert.match(section, /onSave/);
    assert.match(section, /onShare/);
    assert.match(section, /onMore/);
    assert.match(section, /What people are saying/);
    const card = read('components/arena/FreshTakeCard.tsx');
    assert.match(card, /Open Clash|Clash/);
    assert.match(card, /React/);
    assert.match(card, /Save this take/);
    assert.match(card, /Share this take/);
    assert.match(card, /useReducedMotion/);
    const rail = read('components/arena/ArenaDiscoveryRail.tsx');
    for (const scope of ['For You', 'Following', 'Popular', 'New']) {
      assert.match(rail, new RegExp(scope));
    }
    assert.match(rail, /useReducedMotion/);
  });

  it('keeps feed surface empty/loading rules and mode isolation', () => {
    assert.deepEqual(arenaFlatListData('clashes', 'ready', [{ id: '1' }]), []);
    assert.deepEqual(arenaFlatListData('for_you', 'loading', [{ id: '1' }]), []);
    assert.deepEqual(arenaFlatListData('for_you', 'ready', [{ id: '1' }]), [{ id: '1' }]);
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'error', 0), true);
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'ready', 0), true);
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'ready', 3), false);
    assert.equal(shouldShowArenaFeedEmpty('topics', 'ready', 0), false);
    const home = read('app/(tabs)/index.tsx');
    assert.match(home, /selectFeedForScope/);
    assert.match(home, /Couldn't load Arena/);
    assert.match(home, /No live takes right now/);
  });

  it('distinguishes live versus terminal Clash labels in discovery cards', () => {
    const card = read('components/arena/LiveDuelCard.tsx');
    assert.match(card, /LIVE · 1v1/);
    assert.match(card, /SETTLED|CANCELLED/);
    assert.match(card, /Watch Clash|View result/);
    assert.match(card, /settled/);
    const clashes = read('components/arena/ArenaClashes.tsx');
    assert.match(clashes, /LIVE|UPCOMING|COMPLETED/);
    assert.match(clashes, /On now|Coming up/);
  });

  it('keeps topic and community destinations reachable from Home chrome', () => {
    const rail = read('components/arena/ArenaSideRail.tsx');
    assert.match(rail, /ARENA_MODES/);
    assert.match(rail, /topics/);
    assert.match(rail, /community/);
    assert.match(rail, /clashes/);
    assert.match(rail, /zIndex:\s*2/);
    const home = read('app/(tabs)/index.tsx');
    assert.match(home, /ArenaTopics/);
    assert.match(home, /ArenaCommunity/);
    assert.match(home, /ArenaClashes/);
    assert.match(home, /prioritizeInterestTopics/);
    // Groups/Discover must not nest under the For You FlatList (touch + scroll dead ends).
    assert.match(home, /arenaMode === 'community' \|\| arenaMode === 'topics'/);
  });
});
