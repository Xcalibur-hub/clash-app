/*
 * In-memory server for the mounted-hook harness.
 *
 * The hook is real; this file replaces the two service boundaries it imports
 * (`services/liveArenaService`, `services/supabaseClient`). It is therefore
 * written against the *server contract*, not against what the hook happens to
 * need today:
 *
 *   · `list_arena_official_page` returns a JSON **array** of rows — `older`
 *     ordered newest-first, `newer` ordered oldest-first, 40 per page, paged by
 *     the `(preciseCreatedAt, id)` tuple.
 *   · `list_arena_official_page`, `list_arena_room_evidence` and
 *     `get_arena_room_message` all raise 42501 'join the room to read it' for a
 *     non-member. That refusal — not a UI flag — is what makes a thread locked.
 *   · `watch_arena_room` inserts a `spectator` participant row (no capacity
 *     increment), refuses CANCELLED with P0003, and stores a null stance. The
 *     next `get_arena_room` therefore reports `viewer.role = 'spectator'`.
 *   · A settled room is watchable *by the server*. The product declines to offer
 *     it for a group room; that decision lives in the client, so this file must
 *     not enforce it — otherwise a test that proves the client refuses would
 *     really only be proving the fake does.
 *
 * An earlier version of this file returned an object where the service returns
 * an array, never changed membership, and never refused a read. The suite could
 * therefore pass with an empty transcript, `viewer: null`, and every read
 * failing. Shapes here are the contract; if the contract changes, this file is
 * wrong and the suite must be made to fail.
 */

/** `list_arena_official_page`'s p_limit, and the hook's PAGE. */
const PAGE = 40;
/** The signed-in profile. `arena_is_room_member` answers for this identity. */
const PROFILE = 'viewer-1';
/** Fixed clock origin so `preciseCreatedAt` is ordered, stable and microsecond-shaped. */
const EPOCH = Date.UTC(2026, 10, 1, 0, 0, 0);

/* --- boundaries the harness replaces ------------------------------------- */

class SupabaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/* --- recorded state ------------------------------------------------------- */

const state = {
  rooms: new Map(),
  members: new Map(),
  messages: new Map(),
  evidence: new Map(),
  stats: new Map(),
  faults: { watch: null },
  /** Every boundary call, in order, with a monotonic `seq`. */
  calls: [],
  /** Every page read, including the ones that were refused. */
  reads: [],
  seq: 0,
  clock: 0,
};

const notices = [];

function reset() {
  state.rooms.clear();
  state.members.clear();
  state.messages.clear();
  state.evidence.clear();
  state.stats.clear();
  state.faults.watch = null;
  state.calls.length = 0;
  state.reads.length = 0;
  state.seq = 0;
  state.clock = 0;
  notices.length = 0;
}

function record(name, args) {
  state.seq += 1;
  state.calls.push({ seq: state.seq, name, args: args ?? {} });
  return state.seq;
}

/* --- server primitives ---------------------------------------------------- */

const PHASE_FOR_STATUS = {
  OPEN: 'open',
  FINAL_ARGUMENTS: 'final_arguments',
  JUDGING: 'judging',
  SETTLED: 'closed',
  CANCELLED: 'closed',
};

/** Microsecond-precision timestamp, `seconds` past the fixed epoch. */
function stamp(seconds) {
  return new Date(EPOCH + seconds * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, '.$1000Z');
}

/** Ordering key for the `(created_at, id)` tuple the SQL pages on. */
function cursorOrder(row) {
  if (row.preciseCreatedAt === undefined) return null;
  /* Same field names as an `ArenaMessage`, so the read log is inspectable. */
  return { preciseCreatedAt: row.preciseCreatedAt, id: row.id };
}

function compareRows(a, b) {
  if (a.preciseCreatedAt < b.preciseCreatedAt) return -1;
  if (a.preciseCreatedAt > b.preciseCreatedAt) return 1;
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
}

function refusal() {
  /* Exact text and code from `list_arena_official_page`. */
  return new SupabaseError('join the room to read it', '42501');
}

function memberRow(roomId) {
  return state.members.get(roomId)?.get(PROFILE) ?? null;
}

function isMember(roomId) {
  return memberRow(roomId) !== null;
}

function memberCount(roomId) {
  return state.members.get(roomId)?.size ?? 0;
}

function roomMeta(roomId) {
  const room = state.rooms.get(roomId);
  if (!room) throw new SupabaseError('room does not exist', 'P0002');
  return room;
}

/** `my_profile_id() is null or not arena_is_room_member(p_room_id)` → 42501. */
function assertReadable(roomId) {
  roomMeta(roomId);
  if (!isMember(roomId)) throw refusal();
}

function authorOf(name) {
  return {
    id: `author-${name}`,
    handle: `@${name}`,
    name,
    avatarTint: 'amber',
    rank: 'Brawler',
  };
}

/* --- fixture construction ------------------------------------------------- */

const server = {
  seedRoom({
    roomId,
    roomMode = 'DUEL',
    status = 'OPEN',
    topicStatus,
    capacity = 8,
  }) {
    const topic = topicStatus ?? (status === 'SETTLED' || status === 'CANCELLED' ? 'closed' : 'live');
    state.rooms.set(roomId, {
      roomId,
      roomMode,
      status,
      phase: PHASE_FOR_STATUS[status] ?? 'open',
      topicStatus: topic,
      capacity,
      clashId: roomMode === 'DUEL' ? 'clash-1' : null,
      duel:
        roomMode === 'DUEL'
          ? {
              clashId: 'clash-1',
              status: status === 'SETTLED' ? 'settled' : 'live',
              title: 'Trade vs Aid',
              sideA: 'Trade',
              sideB: 'Aid',
            }
          : null,
    });
    state.members.set(roomId, new Map());
    state.messages.set(roomId, []);
    state.evidence.set(roomId, []);
    state.stats.set(roomId, {
      roomId,
      totalInitialParticipants: 2,
      completedParticipants: 2,
      changedCount: 1,
      changedPercent: 50,
    });
    return state.rooms.get(roomId);
  },

  /** Append `count` arguments and return them oldest-first. */
  seedMessages(roomId, count, label = 'argument') {
    const created = [];
    for (let i = 0; i < count; i += 1) created.push(addMessage(roomId, `${label} ${i + 1}`));
    return created;
  },

  appendMessage(roomId, body) {
    return addMessage(roomId, body);
  },

  seedEvidence(roomId, count = 1) {
    roomMeta(roomId);
    const created = [];
    for (let i = 0; i < count; i += 1) {
      const index = state.clock;
      state.clock += 1;
      const preciseCreatedAt = stamp(index);
      const row = {
        preciseCreatedAt,
        id: `ev-${roomId}-${index}`,
        roomId,
        topicId: `topic-${roomId}`,
        messageId: null,
        kind: 'link',
        title: `Source ${i + 1}`,
        sourceUrl: 'https://example.test/source',
        mediaUrl: null,
        usefulCount: 0,
        createdAt: Date.parse(preciseCreatedAt),
        isOwn: false,
        author: authorOf('ada'),
        viewerMarkedUseful: false,
      };
      state.evidence.get(roomId).push(row);
      created.push(row);
    }
    return created;
  },

  /** Make the next `watch_arena_room` reject; pass null to clear. */
  failWatch(error) {
    state.faults.watch = error ?? null;
  },

  isMember,
  memberRow,
  memberCount,
  messagesFor: (roomId) => [...(state.messages.get(roomId) ?? [])],
};

function addMessage(roomId, body) {
  const room = roomMeta(roomId);
  const index = state.clock;
  state.clock += 1;
  const preciseCreatedAt = stamp(index);
  const row = {
    preciseCreatedAt,
    id: `msg-${roomId}-${index}`,
    roomId,
    kind: 'text',
    body,
    parentMessageId: null,
    createdAt: Date.parse(preciseCreatedAt),
    mediaUrl: null,
    mediaKind: null,
    gifProvider: null,
    gifExternalId: null,
    isOwn: false,
    author: authorOf('ada'),
    reactions: [],
    replyCount: 0,
    /* Argument totals are withheld until the room settles. */
    argumentVotes: room.status === 'SETTLED' ? 3 : null,
  };
  state.messages.get(roomId).push(row);
  return row;
}

/* --- liveArenaService boundary ------------------------------------------- */

async function fetchRoom(roomId) {
  record('fetchRoom', { roomId });
  const room = roomMeta(roomId);
  const member = memberRow(roomId);
  return {
    roomMode: room.roomMode,
    clashId: room.clashId,
    duel: room.duel ? clone(room.duel) : null,
    roomId,
    topicId: `topic-${roomId}`,
    status: room.status,
    capacity: room.capacity,
    participantCount: memberCount(roomId),
    opensAt: 0,
    closesAt: 0,
    createdAt: 0,
    phase: room.phase,
    secondsRemaining: 0,
    secondsToFinalArguments: 0,
    secondsToJudging: 0,
    topic: {
      id: `topic-${roomId}`,
      title: 'Trade vs Aid',
      description: null,
      hood: null,
      status: room.topicStatus,
      opensAt: 0,
      finalArgumentsAt: 0,
      judgingAt: 0,
      closesAt: 0,
    },
    /* Null for a non-member: a membership is only ever visible to its owner. */
    viewer: member
      ? {
          isMember: true,
          role: member.role,
          stance: member.stance,
          finalStance: null,
          finalRecordedAt: null,
          joinedAt: member.joinedAt,
          hasSideVote: false,
          hasArgumentVote: false,
        }
      : null,
    result:
      room.status === 'SETTLED'
        ? {
            roomId,
            winningSide: 'AGREE',
            agreeVotes: 3,
            disagreeVotes: 2,
            participantCount: 2,
            mindshiftChangedCount: 1,
            mindshiftCompletedCount: 2,
            mindshiftChangedPercent: 50,
            settledAt: Date.parse(stamp(0)),
            bestArgumentMessageId: null,
            bestArgumentAuthor: null,
            bestArgumentBody: null,
          }
        : null,
  };
}

/**
 * A page of the canonical stream.
 *
 * Mirrors `list_arena_official_page`'s ordering exactly: `newer` ascending so
 * `rows.at(-1)` is the next cursor, `older` descending so the first row is the
 * newest the viewer may read.
 */
function pageRows(roomId, stream, cursor, direction) {
  const all = (stream === 'message' ? state.messages : state.evidence).get(roomId) ?? [];
  if (direction === 'newer') {
    const after = cursor
      ? all.filter((row) => compareRows(row, cursor) > 0)
      : all.slice();
    return after.slice(0, PAGE);
  }
  const before = cursor ? all.filter((row) => compareRows(row, cursor) < 0) : all.slice();
  return before.slice(-PAGE).reverse();
}

async function fetchOfficialPage(roomId, stream, cursor, direction = 'older') {
  const seq = record('fetchOfficialPage', {
    roomId,
    stream,
    direction,
    cursor: cursor ? cursorOrder(cursor) : null,
  });
  const entry = { seq, stream, direction, cursor: cursor ? cursorOrder(cursor) : null };
  try {
    if (stream !== 'message' && stream !== 'evidence') {
      throw new SupabaseError('Invalid page', '22023');
    }
    if (direction !== 'older' && direction !== 'newer') {
      throw new SupabaseError('Invalid page', '22023');
    }
    if (direction === 'newer' && !cursor) throw new SupabaseError('Invalid page', '22023');
    assertReadable(roomId);
    const rows = pageRows(roomId, stream, cursor, direction).map(clone);
    state.reads.push({ ...entry, rows: rows.length, admitted: true });
    return rows;
  } catch (error) {
    state.reads.push({
      ...entry,
      rows: 0,
      admitted: false,
      code: error && error.code ? error.code : null,
    });
    throw error;
  }
}

async function fetchMessage(messageId) {
  record('fetchMessage', { messageId });
  for (const [roomId, rows] of state.messages) {
    const row = rows.find((candidate) => candidate.id === messageId);
    if (!row) continue;
    assertReadable(roomId);
    return clone(row);
  }
  return null;
}

async function fetchEvidence(roomId) {
  record('fetchEvidence', { roomId });
  assertReadable(roomId);
  return [...(state.evidence.get(roomId) ?? [])].reverse().map(clone);
}

async function fetchVisibleMessageIds(roomId, ids) {
  record('fetchVisibleMessageIds', { roomId, ids });
  assertReadable(roomId);
  const known = new Set((state.messages.get(roomId) ?? []).map((row) => row.id));
  return (ids ?? []).filter((id) => known.has(id));
}

async function fetchEvidenceVisibility(roomId, ids) {
  record('fetchEvidenceVisibility', { roomId, ids });
  assertReadable(roomId);
  const known = new Set((state.evidence.get(roomId) ?? []).map((row) => row.id));
  return (ids ?? []).filter((id) => known.has(id));
}

async function fetchMindshiftStats(roomId) {
  record('fetchMindshiftStats', { roomId });
  const room = roomMeta(roomId);
  /* Mindshift opens after the verdict; before that the RPC refuses. */
  if (room.status !== 'SETTLED') throw new SupabaseError('not settled', 'P0002');
  return clone(state.stats.get(roomId));
}

/**
 * `watch_arena_room`.
 *
 * Refuses CANCELLED (P0003) and a room whose topic is not live and is not
 * settled. A settled GROUP room is deliberately permitted: the server allows it,
 * so any refusal of it must come from the client guard under test.
 */
async function watchRoom(roomId) {
  record('watchRoom', { roomId });
  if (state.faults.watch) throw state.faults.watch;
  const room = roomMeta(roomId);
  if (room.topicStatus === 'scheduled') {
    throw new SupabaseError('topic is not available', 'P0003');
  }
  if (room.status === 'CANCELLED') {
    throw new SupabaseError('this room is not available', 'P0003');
  }
  const existing = memberRow(roomId);
  if (existing) {
    return {
      joined: false,
      roomId,
      topicId: `topic-${roomId}`,
      stance: existing.stance,
      role: existing.role,
      status: room.status,
      capacity: room.capacity,
      participantCount: memberCount(roomId),
      joinedAt: existing.joinedAt,
    };
  }
  if (room.topicStatus !== 'live' && room.status !== 'SETTLED') {
    throw new SupabaseError('topic is not live', 'P0003');
  }
  const joinedAt = Date.parse(stamp(state.clock));
  /* Spectators never consume capacity and never store a stance. */
  state.members.get(roomId).set(PROFILE, { role: 'spectator', stance: null, joinedAt });
  return {
    joined: true,
    roomId,
    topicId: `topic-${roomId}`,
    stance: null,
    role: 'spectator',
    status: room.status,
    capacity: room.capacity,
    participantCount: memberCount(roomId),
    joinedAt,
  };
}

async function upgradeSpectator(roomId, stance) {
  record('upgradeSpectator', { roomId, stance });
  const room = roomMeta(roomId);
  const member = memberRow(roomId);
  if (!member) throw new SupabaseError('not a participant', '42501');
  if (room.status === 'SETTLED') throw new SupabaseError('this room is not available', 'P0003');
  if (memberCount(roomId) >= room.capacity) throw new SupabaseError('room is full', 'P0009');
  member.role = 'debater';
  member.stance = stance ?? null;
  return { roomId, role: 'debater', stance: member.stance, status: room.status };
}

const passthrough = (name) => async (...args) => {
  record(name, args[0]);
  return null;
};

function subscribeRoomMessages(roomId) {
  record('subscribeRoomMessages', { roomId });
  return () => {};
}

/* --- supabaseClient boundary --------------------------------------------- */

function currentUserId() {
  return PROFILE;
}

function errorText(error) {
  if (!error) return null;
  return error.message || String(error);
}

/* --- react-native / expo-router boundaries -------------------------------- */

const noop = () => {};
const View = 'View';
const Text = 'Text';

const router = {
  push: (value) => (record('router.push', value), value),
  replace: (value) => (record('router.replace', value), value),
  back: () => record('router.back', {}),
  canGoBack: () => false,
};

function useFocusEffect(callback) {
  const React = require('react');
  React.useEffect(() => {
    const cleanup = callback();
    return typeof cleanup === 'function' ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* --- store boundary ------------------------------------------------------- */

const NOTICE = 'ui/notice';
/** Same shape as `store/actions.ts: showNotice`. */
const showNotice = (message) => ({ type: NOTICE, message });

function useClash() {
  return {
    state: { viewer: { id: PROFILE } },
    dispatch: (action) => {
      if (action && action.type === NOTICE) notices.push(action);
      return action;
    },
  };
}

/* --- assertions helpers used by the tests -------------------------------- */

function watchCalls() {
  return state.calls.filter((call) => call.name === 'watchRoom');
}

function callsNamed(name) {
  return state.calls.filter((call) => call.name === name);
}

/** Page reads for one stream, refused ones included. */
function pageReads(stream) {
  return state.reads.filter((read) => read.stream === stream);
}

module.exports = {
  state,
  server,
  reset,
  notices,
  watchCalls,
  callsNamed,
  pageReads,
  reads: state.reads,
  /* react-native */
  View,
  Text,
  noop,
  /* expo-router */
  router,
  useFocusEffect,
  useLocalSearchParams: () => ({}),
  useRouter: () => router,
  /* clash */
  useClash,
  showNotice,
  /* service */
  fetchRoom,
  fetchEvidence,
  fetchMindshiftStats,
  fetchVisibleMessageIds,
  fetchEvidenceVisibility,
  fetchMessage,
  fetchOfficialPage,
  watchRoom,
  upgradeSpectator,
  subscribeRoomMessages,
  postMessage: passthrough('postMessage'),
  reactMessage: passthrough('reactMessage'),
  recordFinalStance: passthrough('recordFinalStance'),
  submitArgumentVote: passthrough('submitArgumentVote'),
  submitEvidence: passthrough('submitEvidence'),
  submitSideVote: passthrough('submitSideVote'),
  postClashMediaReshare: passthrough('postClashMediaReshare'),
  markEvidenceUseful: passthrough('markEvidenceUseful'),
  /* supabase */
  SupabaseError,
  currentUserId,
  errorText,
};
