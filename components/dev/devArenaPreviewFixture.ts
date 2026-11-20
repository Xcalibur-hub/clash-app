import type { ArenaMessage, ArenaRoom } from '../../services/liveArenaService';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';

export type PreviewStage = 'watch' | 'open' | 'judging' | 'settled';

export function normalizePreviewStage(raw: unknown): PreviewStage {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'open' || value === 'judging' || value === 'settled') return value;
  return 'watch';
}

export function buildDevPreviewRoom(
  stage: PreviewStage,
  nowMs: number,
  perfNowMs: number,
): { room: ArenaRoom; messages: ArenaMessage[] } {
  const settled = stage === 'settled';
  const phase = settled ? 'closed' : stage === 'judging' ? 'judging' : 'open';
  const duel: ArenaDuel = {
    clashId: 'cl_devpreview00001',
    status: settled ? 'settled' : 'open',
    fighterA: {
      id: 'u_preview_fighter_a',
      name: 'Fighter Alpha',
      handle: 'fighter_alpha',
      tint: '#A580FF',
    },
    fighterB: {
      id: 'u_preview_fighter_b',
      name: 'Fighter Bravo',
      handle: 'fighter_bravo',
      tint: '#22C55E',
    },
    viewerRelationship: 'spectator',
    mayJudge: stage === 'judging',
    hasJudged: settled,
    sourceText: 'Preview Take: Local active Arena UI automation verification.',
    counterPosition: 'Preview Counter: Accessibility controls must render reliably.',
    verdict: settled
      ? { winnerSide: 'DRAW', jurySize: 2, sideAScore: 1, sideBScore: 1, verdictLabel: 'Draw' }
      : null,
  };

  const opensAt = settled ? nowMs - 1_800_000 : nowMs - 1_200_000;
  const closesAt = settled ? nowMs - 60_000 : nowMs + 300_000;
  const finalAt = settled ? nowMs - 600_000 : nowMs + 600_000;
  const judgingAt = settled ? nowMs - 300_000 : nowMs + 900_000;

  const room: ArenaRoom = {
    roomMode: 'DUEL',
    clashId: duel.clashId,
    duel,
    roomId: 'ar_devpreview00001',
    topicId: 'at_devpreview00001',
    status: settled ? 'SETTLED' : stage === 'judging' ? 'JUDGING' : 'OPEN',
    capacity: 50,
    participantCount: 4,
    opensAt,
    closesAt,
    createdAt: opensAt,
    phase,
    secondsRemaining: settled ? 0 : 300,
    secondsToFinalArguments: settled || stage === 'judging' ? 0 : 600,
    secondsToJudging: settled || stage === 'judging' ? 0 : 900,
    timing: settled
      ? undefined
      : {
          phase,
          deadline: stage === 'judging' ? nowMs + 300_000 : nowMs + 600_000,
          seconds: stage === 'judging' ? 300 : 600,
          received: perfNowMs,
          latency: 0,
        },
    topic: {
      id: 'at_devpreview00001',
      title: 'Preview Take: Local active Arena UI automation verification.',
      description: 'Development-only non-mutating room preview.',
      hood: 'techtakes',
      status: settled ? 'closed' : 'live',
      opensAt,
      finalArgumentsAt: finalAt,
      judgingAt,
      closesAt,
    },
    viewer: {
      isMember: true,
      role: 'spectator',
      stance: null,
      finalStance: null,
      finalRecordedAt: null,
      joinedAt: nowMs - 60_000,
      hasSideVote: settled,
      hasArgumentVote: false,
    },
    result: null,
  };

  const messages: ArenaMessage[] = [
    {
      id: 'am_preview_01',
      roomId: room.roomId,
      kind: 'text',
      body: 'Fighter Alpha OPEN: Accessibility nodes and bounds remain verifiable.',
      parentMessageId: null,
      createdAt: nowMs - 120_000,
      mediaUrl: null,
      mediaKind: null,
      gifProvider: null,
      gifExternalId: null,
      isOwn: false,
      author: { ...duel.fighterA, avatarTint: '#A580FF', rank: 'Contender' },
      reactions: [],
      replyCount: 0,
      argumentVotes: null,
    },
    {
      id: 'am_preview_02',
      roomId: room.roomId,
      kind: 'text',
      body: 'Fighter Bravo OPEN: Countdown intervals must not block UI hierarchy dumps.',
      parentMessageId: null,
      createdAt: nowMs - 60_000,
      mediaUrl: null,
      mediaKind: null,
      gifProvider: null,
      gifExternalId: null,
      isOwn: false,
      author: { ...duel.fighterB, avatarTint: '#22C55E', rank: 'Contender' },
      reactions: [],
      replyCount: 0,
      argumentVotes: null,
    },
  ];

  return { room, messages };
}
