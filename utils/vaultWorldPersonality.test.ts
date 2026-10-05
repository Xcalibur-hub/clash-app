import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  personalityCollageOrder,
  personalityMediaShape,
  personalityNameOutside,
  personalityRadius,
  personalityScatter,
  personalityTilt,
  worldPersonality,
  type WorldPersonality,
} from './vaultWorldPersonality.ts';

const ALL: WorldPersonality[] = ['cinematic', 'contact', 'studio', 'blueprint', 'editorial'];

describe('creator world personality', () => {
  it('maps the fixture creators to distinct worlds', () => {
    assert.equal(worldPersonality({ creatorId: 'devfx_vw_maya', name: 'Maya' }), 'cinematic');
    assert.equal(worldPersonality({ creatorId: 'devfx_vw_leo', name: 'Leo' }), 'contact');
    assert.equal(worldPersonality({ creatorId: 'devfx_vw_aria', name: 'Aria' }), 'studio');
    assert.equal(worldPersonality({ creatorId: 'devfx_vw_noah', name: 'Noah' }), 'blueprint');
  });

  it('is deterministic and scoped to the creator id', () => {
    const a = worldPersonality({ creatorId: 'abc', handle: 'zzz', name: 'Zzz' });
    const b = worldPersonality({ creatorId: 'abc', handle: 'zzz', name: 'Zzz' });
    assert.equal(a, b);
    assert.ok(ALL.includes(a));
  });

  it('falls back to a stable personality for unknown creators', () => {
    const p = worldPersonality({ creatorId: 'unknown-creator-id-42' });
    assert.ok(ALL.includes(p));
    assert.equal(worldPersonality({ creatorId: 'unknown-creator-id-42' }), p);
  });

  it('sharpens corners for the rigid worlds', () => {
    assert.ok(personalityRadius('blueprint') < personalityRadius('cinematic'));
    assert.ok(personalityRadius('cinematic') < personalityRadius('contact'));
    assert.ok(personalityRadius('contact') < personalityRadius('studio'));
  });

  it('gives each world a different collage shape at the same index', () => {
    const shapes = new Set([
      personalityCollageOrder('cinematic', 0),
      personalityCollageOrder('contact', 0),
      personalityCollageOrder('studio', 0),
      personalityCollageOrder('blueprint', 0),
    ]);
    assert.ok(shapes.size >= 3);
  });

  it('only scatters the tactile worlds', () => {
    assert.equal(personalityScatter('blueprint', 1), 0);
    assert.equal(personalityScatter('studio', 1), 0);
    assert.notEqual(personalityScatter('cinematic', 1), 0);
    assert.notEqual(personalityScatter('contact', 1), 0);
  });

  it('assigns media language per personality', () => {
    assert.equal(personalityMediaShape('studio'), 'circle');
    assert.equal(personalityMediaShape('cinematic'), 'film');
    assert.equal(personalityMediaShape('blueprint'), 'rect');
    assert.equal(personalityTilt('contact', 0) !== 0, true);
    assert.equal(personalityTilt('blueprint', 0), 0);
    assert.equal(personalityNameOutside('contact'), true);
    assert.equal(personalityNameOutside('cinematic'), false);
  });
});
