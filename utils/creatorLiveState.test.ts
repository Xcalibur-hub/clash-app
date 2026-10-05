import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasReachedThreshold,
  interactionIsOpen,
  interactionPromptVerb,
  interactionTypeLabel,
  leadingOption,
  liveActionLabel,
  liveStatusLabel,
  optionShare,
  tallyFor,
  tallyTotal,
  thresholdProgress,
  thresholdRemaining,
  watchingLabel,
  type LiveOption,
} from './creatorLiveState.ts';
import {
  activeInteraction,
  applyLiveEvent,
  applyLiveEvents,
  mergeEvents,
  type LiveEvent,
  type LiveScreenState,
} from './creatorLiveEvents.ts';
import { isNativePlayable, resolveLiveVideoSource } from './creatorLiveVideo.ts';

const OPTIONS: LiveOption[] = [
  { id: 'basement', label: 'Basement' },
  { id: 'attic', label: 'Attic' },
];

function event(partial: Partial<LiveEvent> & { id: string; kind: LiveEvent['kind'] }): LiveEvent {
  return {
    interactionId: null,
    actionKind: null,
    payload: {},
    createdAt: 1,
    ...partial,
  };
}

describe('creator live presentation', () => {
  it('labels session states without pretending live', () => {
    assert.equal(liveStatusLabel('LIVE'), 'LIVE');
    assert.equal(liveStatusLabel('SCHEDULED'), 'NEXT LIVE');
    assert.equal(liveStatusLabel('ENDED'), 'ENDED');
    assert.equal(liveStatusLabel('CANCELLED'), 'OFFLINE');
  });

  it('names every interaction type and its verb', () => {
    assert.equal(interactionTypeLabel('POLL'), 'Poll');
    assert.equal(interactionTypeLabel('CROWD_ACTION'), 'Crowd action');
    assert.equal(interactionPromptVerb('CROWD_ACTION'), 'Support');
    assert.equal(interactionPromptVerb('GAME_ACTION'), 'Choose');
    assert.equal(interactionPromptVerb('POLL'), 'Vote');
  });

  it('labels only the approved action identifiers', () => {
    assert.equal(liveActionLabel('LIGHTS_OFF'), 'Lights out');
    assert.equal(liveActionLabel('OPEN_LEFT_DOOR'), 'Left door opened');
    assert.equal(liveActionLabel('HOLD_FRAME'), 'Frame held');
  });

  it('reads tallies defensively', () => {
    assert.equal(tallyFor({ basement: 3 }, 'basement'), 3);
    assert.equal(tallyFor({ basement: 3 }, 'attic'), 0);
    assert.equal(tallyFor(null, 'basement'), 0);
    assert.equal(tallyTotal({ basement: 3, attic: 1 }), 4);
    assert.equal(tallyTotal(null), 0);
    assert.equal(optionShare({ basement: 3, attic: 1 }, 'basement'), 0.75);
    assert.equal(optionShare({}, 'basement'), 0);
  });

  it('computes threshold progress without trusting the client', () => {
    assert.equal(thresholdProgress(500, 1000), 0.5);
    assert.equal(thresholdProgress(1200, 1000), 1);
    assert.equal(thresholdProgress(5, null), 0);
    assert.equal(thresholdRemaining(823, 1000), 177);
    assert.equal(thresholdRemaining(1200, 1000), 0);
    assert.equal(hasReachedThreshold(1000, 1000), true);
    assert.equal(hasReachedThreshold(999, 1000), false);
    assert.equal(hasReachedThreshold(1, null), false);
  });

  it('finds the leading option and formats watch counts', () => {
    assert.equal(leadingOption({ attic: 2, basement: 5 }, OPTIONS)?.id, 'basement');
    assert.equal(leadingOption({}, OPTIONS), null);
    assert.equal(watchingLabel(0), 'No one watching yet');
    assert.equal(watchingLabel(1), '1 watching');
    assert.equal(watchingLabel(127), '127 watching');
    assert.equal(watchingLabel(1234), '1.2K watching');
  });

  it('treats only open, unexpired interactions as participable', () => {
    assert.equal(interactionIsOpen('OPEN', null, 100), true);
    assert.equal(interactionIsOpen('OPEN', 200, 100), true);
    assert.equal(interactionIsOpen('OPEN', 50, 100), false);
    assert.equal(interactionIsOpen('CLOSED', null, 100), false);
    assert.equal(interactionIsOpen('TRIGGERED', null, 100), false);
  });
});

describe('creator live event stream', () => {
  const base: LiveScreenState = {
    status: 'LIVE',
    interactions: [
      {
        id: 'cli_1',
        type: 'CROWD_ACTION',
        prompt: 'Turn the lights off',
        options: null,
        actionKind: 'LIGHTS_OFF',
        threshold: 3,
        status: 'OPEN',
        tallies: {},
        totalVotes: 0,
        result: null,
        openedAt: 1,
        closesAt: null,
        voted: false,
        myVote: null,
        canParticipate: true,
      },
    ],
    banner: null,
  };

  it('applies a tally push to the matching interaction only', () => {
    const next = applyLiveEvent(
      base,
      event({
        id: 'e1',
        kind: 'TALLY',
        interactionId: 'cli_1',
        payload: { total: 2, tallies: { support: 2 } },
      }),
    );
    assert.equal(next.interactions[0]?.totalVotes, 2);
    assert.deepEqual(next.interactions[0]?.tallies, { support: 2 });
  });

  it('ignores a tally for an unknown interaction', () => {
    const next = applyLiveEvent(
      base,
      event({ id: 'e2', kind: 'TALLY', interactionId: 'nope', payload: { total: 9 } }),
    );
    assert.deepEqual(next, base);
  });

  it('flags a triggered action and raises the crowd banner', () => {
    const next = applyLiveEvent(
      base,
      event({
        id: 'e3',
        kind: 'ACTION_TRIGGERED',
        interactionId: 'cli_1',
        actionKind: 'LIGHTS_OFF',
        payload: { supports: 3, threshold: 3 },
      }),
    );
    assert.equal(next.interactions[0]?.status, 'TRIGGERED');
    assert.equal(next.interactions[0]?.canParticipate, false);
    assert.equal(next.banner?.label, 'Action triggered');
    assert.equal(next.banner?.actionKind, 'LIGHTS_OFF');
  });

  it('opens a new interaction from the event payload', () => {
    const next = applyLiveEvent(
      base,
      event({
        id: 'e4',
        kind: 'INTERACTION_OPENED',
        interactionId: 'cli_2',
        createdAt: 5,
        payload: { type: 'POLL', prompt: 'Where next?', options: OPTIONS, closesAt: 5000 },
      }),
    );
    assert.equal(next.interactions.length, 2);
    assert.equal(next.interactions[0]?.id, 'cli_2');
    assert.equal(next.interactions[0]?.prompt, 'Where next?');
    assert.equal(next.interactions[0]?.options?.length, 2);
  });

  it('carries the server result into a closed interaction', () => {
    const next = applyLiveEvent(
      base,
      event({
        id: 'e5',
        kind: 'INTERACTION_CLOSED',
        interactionId: 'cli_1',
        payload: { status: 'CLOSED', result: { winner: 'basement', total: 4 } },
      }),
    );
    assert.equal(next.interactions[0]?.status, 'CLOSED');
    assert.equal(next.interactions[0]?.result?.winner, 'basement');
    assert.equal(next.interactions[0]?.canParticipate, false);
  });

  it('ends the session on the session event', () => {
    const next = applyLiveEvents(base, [event({ id: 'e6', kind: 'SESSION_ENDED', createdAt: 9 })]);
    assert.equal(next.status, 'ENDED');
    assert.equal(next.banner?.label, 'Session ended');
  });

  it('dedupes and bounds the replay cursor', () => {
    const a = event({ id: 'a', kind: 'TALLY', createdAt: 2 });
    const b = event({ id: 'b', kind: 'TALLY', createdAt: 3 });
    const merged = mergeEvents([a], [a, b], 10);
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['a', 'b'],
    );
    assert.equal(mergeEvents([], [a, b], 1).length, 1);
  });

  it('prefers an open interaction, then a triggered one', () => {
    const open = base.interactions[0] as NonNullable<LiveScreenState['interactions'][number]>;
    const closed = { ...open, id: 'closed', status: 'CLOSED' as const };
    const triggered = { ...open, id: 'fired', status: 'TRIGGERED' as const };
    assert.equal(activeInteraction([closed, open])?.id, 'cli_1');
    assert.equal(activeInteraction([closed, triggered])?.id, 'fired');
    assert.equal(activeInteraction([]), null);
  });
});


describe('creator live video source', () => {
  it('only hands a real provider url to the player', () => {
    const source = resolveLiveVideoSource({
      provider: 'hls',
      streamUrl: 'https://example.test/live.m3u8',
      posterUrl: 'https://example.test/poster.png',
      status: 'LIVE',
    });
    assert.equal(source.kind, 'hls');
    assert.equal(source.playable, true);
    assert.equal(source.note, null);
    assert.equal(isNativePlayable(source), true);
  });

  it('refuses a non-https or missing url', () => {
    const source = resolveLiveVideoSource({
      provider: 'hls',
      streamUrl: 'rtmp://example.test/live',
      posterUrl: null,
      status: 'LIVE',
    });
    assert.equal(source.playable, false);
    assert.equal(source.kind, 'standby');
    assert.equal(source.note, 'Standby feed · poster only');
  });

  it('labels a standby poster honestly instead of faking video', () => {
    const source = resolveLiveVideoSource({
      provider: 'standby',
      streamUrl: null,
      posterUrl: 'https://example.test/poster.png',
      status: 'LIVE',
    });
    assert.equal(source.playable, false);
    assert.equal(source.posterUrl, 'https://example.test/poster.png');
    assert.equal(isNativePlayable(source), false);
  });

  it('shows a poster when the session is not live yet', () => {
    const scheduled = resolveLiveVideoSource({
      provider: 'hls',
      streamUrl: 'https://example.test/live.m3u8',
      posterUrl: null,
      status: 'SCHEDULED',
    });
    assert.equal(scheduled.kind, 'poster');
    assert.equal(scheduled.note, 'Starts soon');
    const ended = resolveLiveVideoSource({
      provider: 'hls',
      streamUrl: 'https://example.test/live.m3u8',
      posterUrl: null,
      status: 'ENDED',
    });
    assert.equal(ended.note, 'Offline');
  });
});

