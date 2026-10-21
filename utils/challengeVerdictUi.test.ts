/**
 * UI Phase 5 — Challenge → entrance → verdict presentation regressions.
 * Source/contract guards only; no device rendering.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { duelEntranceDurationMs } from './challengePresentation.ts';
import { nextClashActionVisible } from './nextClashNotice.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

describe('UI Phase 5 challenge and verdict experience', () => {
  it('keeps invitation and inbox action accessibility aligned with swipe semantics', () => {
    const invitation = read('components/arena/ChallengeInvitation.tsx');
    assert.match(invitation, /challengeActionAccessibility\('accept'\)/);
    assert.match(invitation, /challengeActionAccessibility\('pass'\)/);
    assert.match(invitation, /Swipe right to accept/);
    assert.match(invitation, /CHALLENGER/);
    assert.match(invitation, /YOUR TAKE/);
    assert.match(invitation, /THE COUNTERPOSITION/);
    assert.match(invitation, /Opposing fighter/);

    const inbox = read('components/arena/ChallengeInbox.tsx');
    assert.match(inbox, /challengeActionAccessibility/);
    assert.match(inbox, /challengeStatusPresentation/);
    assert.match(inbox, /challengeInboxActorRole/);
    assert.match(inbox, /SOURCE TAKE/);
    assert.match(inbox, /COUNTERPOSITION/);
    assert.match(inbox, /Accept/);
    assert.match(inbox, /Decline/);
  });

  it('presents accepted, declined, and expired states without inventing outcomes', () => {
    const presentation = read('utils/challengePresentation.ts');
    assert.match(presentation, /case 'ACCEPTED'/);
    assert.match(presentation, /case 'PASSED'/);
    assert.match(presentation, /case 'EXPIRED'/);
    assert.match(presentation, /Declined/);
    const invitation = read('components/arena/ChallengeInvitation.tsx');
    assert.match(invitation, /challengeStatusPresentation/);
    assert.match(invitation, /challengeEligibilityCopy/);
  });

  it('gates DuelEntrance once with reduced-motion duration and skip', () => {
    const entrance = read('components/liveArena/DuelEntrance.tsx');
    assert.match(entrance, /shouldPlayOnce\(momentKey\)/);
    assert.match(entrance, /duelEntranceDurationMs/);
    assert.match(entrance, /useReducedMotion/);
    assert.match(entrance, /Skip Clash intro/);
    assert.match(entrance, /Tap anywhere to skip/);
    assert.match(entrance, /useSafeAreaInsets/);
    assert.equal(duelEntranceDurationMs(true), 120);
    assert.equal(duelEntranceDurationMs(false), 620);
    assert.doesNotMatch(entrance, /withRepeat|Animated\.loop/);
  });

  it('separates verdict announcement, explanation, and next-clash action', () => {
    const verdict = read('components/liveArena/VerdictReveal.tsx');
    assert.match(verdict, /verdictSheetSections/);
    assert.match(verdict, /verdictEyebrow/);
    assert.match(verdict, /Official winner/);
    assert.match(verdict, /sections\.explanation/);
    assert.doesNotMatch(verdict, /SUPPORT.*winner|winner.*SUPPORT/);
    const presentation = read('utils/verdictPresentation.ts');
    assert.match(presentation, /CANCELLED/);
    assert.match(presentation, /PENDING/);
    assert.match(presentation, /VERDICT/);

    const next = read('components/liveArena/NextClashAction.tsx');
    assert.match(next, /NEXT CLASH/);
    assert.match(next, /separate from this verdict/);
    assert.match(next, /Watch Clash/);

    const outcome = read('components/liveArena/DuelRoomOutcome.tsx');
    assert.match(outcome, /VERDICT_IS_NOT_SUPPORT/);
    assert.match(outcome, /NextClashAction/);
    assert.match(outcome, /nextClashActionVisible/);
  });

  it('wires next-clash visibility only after a verdict', () => {
    assert.equal(
      nextClashActionVisible({ hasVerdict: true, hasSuggestion: true, notice: null }),
      true,
    );
    assert.equal(
      nextClashActionVisible({ hasVerdict: false, hasSuggestion: true, notice: null }),
      false,
    );
    assert.equal(
      nextClashActionVisible({ hasVerdict: true, hasSuggestion: false, notice: 'Unavailable' }),
      true,
    );
  });

  it('keeps full-screen deck safe-area aware and reduced-motion modal', () => {
    const deck = read('components/arena/FullScreenChallengeDeck.tsx');
    assert.match(deck, /useSafeAreaInsets/);
    assert.match(deck, /useReducedMotion/);
    assert.match(deck, /animationType=\{reduced \? 'none' : 'fade'\}/);
    assert.match(deck, /ChallengeInvitation/);
    assert.match(deck, /challengeCanAct/);
  });

  it('aligns confirmation overlay language with Arena entrance', () => {
    const overlay = read('components/arena/ClashConfirmedOverlay.tsx');
    assert.match(overlay, /CHALLENGE ACCEPTED/);
    assert.match(overlay, /ENTERING ARENA/);
    assert.match(overlay, /useReducedMotion/);
  });
});
