/** Motion regression guards: one-shot moments and reduced-motion wiring. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string => fs.readFileSync(path.join(here, '..', relative), 'utf8');

describe('motion wiring', () => {
  it('gates the entrance once per Clash instead of per mount', () => {
    const room = read('components/liveArena/DuelRoomExperience.tsx');
    assert.match(room, /const \[entrance, setEntrance\] = React\.useState\(false\)/);
    assert.match(room, /shouldPlayOnce\(entranceKey\)/);
  });

  it('offers an immediate skip so the Stage is never blocked for an animation', () => {
    const entrance = read('components/liveArena/DuelEntrance.tsx');
    assert.match(entrance, /Skip Clash intro/);
    assert.match(entrance, /onPress=/);
    assert.match(entrance, /useReducedMotion/);
  });

  it('keeps the verdict reveal one-shot and reduced-motion aware', () => {
    const verdict = read('components/liveArena/VerdictReveal.tsx');
    assert.match(verdict, /hasPlayed\(momentKey\)/);
    assert.match(verdict, /markPlayed\(momentKey\)/);
    assert.match(verdict, /shouldPlayOnce\(`haptic:/);
    assert.match(verdict, /useReducedMotion/);
    assert.match(verdict, /reduced \|\| !animate/);
  });

  it('fades the compact Stage only when motion is allowed', () => {
    const stage = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(stage, /FadeIn\.duration\(140\)/);
    assert.match(stage, /reduced \? undefined : FadeIn/);
  });

  it('does not add continuous loops to the crowd layer', () => {
    const crowd = read('components/liveArena/LiveCrowdLayer.tsx');
    assert.doesNotMatch(crowd, /withRepeat|Animated\.loop|requestAnimationFrame/);
  });
});
