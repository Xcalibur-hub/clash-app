import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArenaTrendingBattle } from '../services/arenaTrendService.ts';
import type { ExploreLiveFeed, ExploreVaultPreview } from '../services/exploreService.ts';
import {
  arenaTopicHref,
  EXPLORE_SHELF_MIN_ITEMS,
  liveShelfItems,
  shelfIsVisible,
  trendingShelfItems,
  vaultDropHref,
  vaultShelfItems,
} from './exploreShelf.ts';

function battle(
  overrides: Partial<ArenaTrendingBattle> & { topicId: string },
): ArenaTrendingBattle {
  return {
    rank: 1,
    title: 'Topic',
    hood: null,
    attentionScore: 0,
    weightedScore: 0,
    momentum: 'STEADY',
    rankDelta: null,
    rankDeltaKind: 'INSUFFICIENT',
    changePercent: null,
    topicStatus: 'live',
    participantCount: 0,
    activeRoomCount: 0,
    hotRoomId: null,
    series: [],
    historyReady: false,
    ...overrides,
  };
}

function preview(
  overrides: Partial<ExploreVaultPreview> & { dropId: string },
): ExploreVaultPreview {
  return {
    vaultId: 'v1',
    creatorId: 'c1',
    title: 'Drop',
    accessLevel: 'free',
    publicMediaPath: null,
    mediaUrl: null,
    mediaKind: null,
    authorHandle: 'ada',
    authorName: 'Ada',
    authorTint: '#A1A1AA',
    countryCode: null,
    ...overrides,
  };
}

describe('Explore shelf visibility', () => {
  it('needs at least two cards before rendering a shelf', () => {
    assert.equal(EXPLORE_SHELF_MIN_ITEMS, 2);
    assert.equal(shelfIsVisible([]), false);
    assert.equal(
      shelfIsVisible([
        { id: '1', kind: 'LIVE', title: 'a', subtitle: null, meta: null, mediaUrl: null, href: '/a' },
      ]),
      false,
    );
    assert.equal(
      shelfIsVisible([
        { id: '1', kind: 'LIVE', title: 'a', subtitle: null, meta: null, mediaUrl: null, href: '/a' },
        { id: '2', kind: 'LIVE', title: 'b', subtitle: null, meta: null, mediaUrl: null, href: '/b' },
      ]),
      true,
    );
  });

  it('encodes canonical Arena and Vault routes', () => {
    assert.equal(arenaTopicHref('t 1'), '/arena/topic/t%201');
    assert.equal(vaultDropHref('d/1'), '/vault/drop/d%2F1');
  });
});

describe('trendingShelfItems', () => {
  it('projects rank, delta and joined count', () => {
    const items = trendingShelfItems([
      battle({
        topicId: 't1',
        title: 'Blind date?',
        hood: 'Indiranagar',
        rank: 2,
        rankDeltaKind: 'UP',
        rankDelta: 2,
        participantCount: 5,
      }),
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'CLASH');
    assert.equal(items[0]?.meta, '#2 · ↑2 · 5 joined');
    assert.equal(items[0]?.subtitle, 'Indiranagar');
    assert.equal(items[0]?.href, '/arena/topic/t1');
  });

  it('omits an unknown delta and dedupes topic ids', () => {
    const items = trendingShelfItems([
      battle({ topicId: 't1', rank: 1 }),
      battle({ topicId: 't1', rank: 1 }),
      battle({ topicId: 't2', rank: 3 }),
    ]);
    assert.deepEqual(
      items.map((item) => item.id),
      ['t1', 't2'],
    );
    assert.equal(items[0]?.meta, '#1');
  });

  it('caps the shelf length', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      battle({ topicId: `t${i}`, rank: i + 1 }),
    );
    assert.equal(trendingShelfItems(many, 6).length, 6);
  });
});

describe('vaultShelfItems', () => {
  it('labels free and preview access without exposing paid paths', () => {
    const items = vaultShelfItems([
      preview({ dropId: 'd1', mediaUrl: 'https://cdn/x.jpg' }),
      preview({ dropId: 'd2', accessLevel: 'preview', authorHandle: '' }),
    ]);
    assert.equal(items[0]?.meta, 'FREE');
    assert.equal(items[0]?.subtitle, '@ada');
    assert.equal(items[0]?.mediaUrl, 'https://cdn/x.jpg');
    assert.equal(items[1]?.meta, 'PREVIEW');
    assert.equal(items[1]?.subtitle, 'Ada');
    assert.equal(items[1]?.href, '/vault/drop/d2');
  });
});

describe('liveShelfItems', () => {
  const feed: ExploreLiveFeed = {
    topics: [
      { id: 't1', title: 'Room', hood: 'Koramangala', status: 'live', closesAt: 0, href: '/arena/topic/t1' },
    ],
    takes: [
      { id: 'k1', title: 'Take', subtitle: '@ada', heat: 42, mediaUrl: null, creatorId: 'c1', countryCode: null, href: '/take/k1' },
      { id: 'k1', title: 'Take', subtitle: '@ada', heat: 42, mediaUrl: null, creatorId: 'c1', countryCode: null, href: '/take/k1' },
    ],
  };

  it('puts live topics before takes and dedupes', () => {
    const items = liveShelfItems(feed);
    assert.deepEqual(
      items.map((item) => item.kind),
      ['LIVE', 'TAKE'],
    );
    assert.equal(items[1]?.meta, 'Heat 42');
    assert.equal(items[1]?.href, '/take/k1');
  });

  it('returns nothing without a feed', () => {
    assert.deepEqual(liveShelfItems(null), []);
  });
});
