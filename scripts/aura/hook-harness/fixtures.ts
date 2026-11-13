import type { ArenaRoom, ArenaRoomStatus, ArenaMessage } from '../../../services/liveArenaService';
export function room(mode: 'DUEL' | 'GROUP', status: ArenaRoomStatus): ArenaRoom {
  const closed = status === 'SETTLED' || status === 'CANCELLED';
  return { roomMode: mode, clashId: mode === 'DUEL' ? 'clash-1' : null,
    duel: mode === 'GROUP' ? null : { clashId: 'clash-1',
      status: status === 'SETTLED' ? 'settled' : status === 'CANCELLED' ? 'cancelled' : 'open',
      fighterA: { id: 'a', name: 'A', handle: 'fighter-a' },
      fighterB: { id: 'b', name: 'B', handle: 'fighter-b' },
      viewerRelationship: 'spectator', mayJudge: false, hasJudged: false,
      verdict: status === 'SETTLED' ? { winnerSide: 'DRAW', jurySize: 0, verdictLabel: 'Draw' } : null },
    roomId: 'room-1', topicId: 'topic-1', status, capacity: 20, participantCount: 2,
    opensAt: 1000, closesAt: 9000, createdAt: 1000,
    phase: closed ? 'closed' : 'open', secondsRemaining: closed ? 0 : 8,
    secondsToFinalArguments: 4, secondsToJudging: 6,
    topic: { id: 'topic-1', title: 'Trade vs Aid', description: null, hood: null,
      status: closed ? 'closed' : 'live', opensAt: 1000, finalArgumentsAt: 5000, judgingAt: 7000, closesAt: 9000 },
    viewer: null, result: null };
}
export const message: ArenaMessage = {
  id: 'message-1', roomId: 'room-1', kind: 'text', body: 'An existing authorized argument',
  parentMessageId: null, createdAt: 2000, preciseCreatedAt: '2026-01-01T00:00:02.000000Z',
  mediaUrl: null, mediaKind: null, gifProvider: null, gifExternalId: null, isOwn: false,
  author: { id: 'a', handle: 'fighter-a', name: 'A', avatarTint: '#444444', rank: 'Brawler' },
  reactions: [], replyCount: 0, argumentVotes: null,
};
