import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWorldRows, type WorldRowsDeps, type WorldRowsInput } from './vaultWorldRows.ts';
import type { CreatorModuleType } from './vaultModules.ts';

const deps: WorldRowsDeps = {
  creatorName: 'Maya',
  chapterTitle: (module: CreatorModuleType, name: string) => `${module}:${name}`,
  dropMedia: (drop) => `media:${drop.id}`,
  dropAccess: () => 'FREE',
  collectionDrops: (collection, all) =>
    all.filter((drop) => drop.collectionIds.includes(collection.id)),
  serviceMedia: () => null,
  courseMedia: () => null,
  productMedia: () => null,
  worldDropMedia: () => null,
  priceLabel: () => 'Free',
};

function drop(id: string, collections: string[]): never {
  return {
    id,
    caption: `caption-${id}`,
    accessLevel: 'free',
    status: 'published',
    createdAt: 0,
    publishedAt: 0,
    expiresAt: null,
    creatorId: 'c1',
    vaultId: 'v1',
    accessible: true,
    collectionIds: collections,
    publicMedia: null,
    previewMedia: null,
  } as never;
}

function input(partial: Partial<WorldRowsInput>): WorldRowsInput {
  return {
    modules: [],
    drops: [],
    collections: [],
    services: [],
    courses: [],
    products: [],
    worldDrops: [],
    liveSessions: [],
    communityReady: false,
    personality: 'cinematic',
    ...partial,
  };
}

describe('creator world rows', () => {
  it('renders an empty row when no modules are supported', () => {
    assert.deepEqual(buildWorldRows(input({}), deps), [{ kind: 'empty' }]);
  });

  it('renders a numbered chapter followed by the drops strip', () => {
    const rows = buildWorldRows(
      input({
        modules: [{ type: 'CONTENT' }],
        drops: [drop('d1', []), drop('d2', [])],
      }),
      deps,
    );
    assert.equal(rows[0]?.kind, 'chapter');
    assert.equal(rows[1]?.kind, 'drops');
    if (rows[0]?.kind === 'chapter') {
      assert.equal(rows[0].index, 1);
      assert.equal(rows[0].count, 2);
      assert.equal(rows[0].title, 'CONTENT:Maya');
    }
    if (rows[1]?.kind === 'drops') {
      assert.equal(rows[1].drops.length, 2);
      assert.equal(rows[1].drops[0]?.mediaUrl, 'media:d1');
      assert.equal(rows[1].personality, 'cinematic');
    }
  });

  it('increments chapter numbers across modules', () => {
    const rows = buildWorldRows(
      input({
        modules: [{ type: 'CONTENT' }, { type: 'SERVICES' }, { type: 'STORE' }],
        drops: [drop('d1', [])],
      }),
      deps,
    );
    const indices = rows.filter((row) => row.kind === 'chapter').map((row) => (row as { index: number }).index);
    assert.deepEqual(indices, [1, 2, 3]);
  });

  it('only includes the community chapter when the room is ready', () => {
    const without = buildWorldRows(input({ modules: [{ type: 'COMMUNITY' }] }), deps);
    assert.deepEqual(without, [{ kind: 'empty' }]);

    const withRoom = buildWorldRows(
      input({ modules: [{ type: 'COMMUNITY' }], communityReady: true }),
      deps,
    );
    assert.deepEqual(
      withRoom.map((row) => row.kind),
      ['chapter', 'community'],
    );
  });

  it('renders a world-drops chapter with its artifacts', () => {
    const rows = buildWorldRows(
      input({
        modules: [{ type: 'WORLD_DROPS' }],
        worldDrops: [
          {
            id: 'wd1',
            caption: 'The Missing Frame',
            dropType: 'SECRET_DROP',
            claimed: false,
            creatorTint: '#C45C26',
            locationLabel: 'Mumbai',
            media: null,
          } as never,
        ],
      }),
      deps,
    );
    assert.deepEqual(
      rows.map((row) => row.kind),
      ['chapter', 'worldDrops'],
    );
    const row = rows[1];
    if (row.kind === 'worldDrops') {
      assert.equal(row.items[0]?.caption, 'The Missing Frame');
      assert.equal(row.items[0]?.place, 'Mumbai');
      assert.equal(row.items[0]?.claimed, false);
    }
  });

  it('omits the world-drops chapter when nothing is hidden', () => {
    const rows = buildWorldRows(input({ modules: [{ type: 'WORLD_DROPS' }] }), deps);
    assert.deepEqual(rows, [{ kind: 'empty' }]);
  });

  it('adds a live chapter only while a session is live or scheduled', () => {
    const live = buildWorldRows(
      input({
        modules: [{ type: 'LIVE' }],
        liveSessions: [{ id: 'cls_1', status: 'LIVE', title: 'Filming Episode 05' } as never],
      }),
      deps,
    );
    assert.deepEqual(
      live.map((row) => row.kind),
      ['chapter', 'live'],
    );

    const scheduled = buildWorldRows(
      input({
        modules: [{ type: 'LIVE' }],
        liveSessions: [{ id: 'cls_2', status: 'SCHEDULED', title: 'Friday session' } as never],
      }),
      deps,
    );
    assert.deepEqual(
      scheduled.map((row) => row.kind),
      ['chapter', 'live'],
    );

    const archived = buildWorldRows(
      input({
        modules: [{ type: 'LIVE' }],
        liveSessions: [{ id: 'cls_3', status: 'ENDED', title: 'Old session' } as never],
      }),
      deps,
    );
    assert.deepEqual(archived, [{ kind: 'empty' }]);
  });

  it('resolves collection membership from the injected resolver', () => {
    const rows = buildWorldRows(
      input({
        modules: [{ type: 'COLLECTIONS' }],
        drops: [drop('d1', ['col1']), drop('d2', ['col2'])],
        collections: [
          {
            id: 'col1',
            vaultId: 'v1',
            creatorId: 'c1',
            title: 'Series',
            description: 'desc',
            createdAt: 0,
            drops: [],
          },
        ],
      }),
      deps,
    );
    const collectionRow = rows[1];
    assert.equal(collectionRow?.kind, 'collections');
    if (collectionRow?.kind === 'collections') {
      assert.equal(collectionRow.collections[0]?.count, 1);
      assert.equal(collectionRow.collections[0]?.drops[0]?.id, 'd1');
    }
  });
});
