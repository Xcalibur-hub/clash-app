/*
 * Runtime fakes for the mounted-hook harness.
 *
 * `useLiveArenaRoom` is a real hook with real effects; the only things it must
 * not do in a test are talk to Supabase and touch Expo Router. Everything here
 * is therefore a boundary stub — it records what the hook asked for and returns
 * a scripted answer. No hook logic is reimplemented.
 *
 * The harness drives the *actual* hook via react-test-renderer, so a regression
 * in the hook's control flow (an early return before the RPC, a wrong status
 * guard, a dropped refresh) fails here.
 */

const state = {
  calls: [],
  watchResult: { status: 'ok' },
  upgradeResult: { status: 'ok' },
  room: null,
  messages: [],
  evidence: [],
  stats: null,
  /** Force `watchRoom` to reject with a given Supabase-shaped error. */
  watchError: null,
  /** Force `fetchRoom` to reject. */
  roomError: null,
};

function reset() {
  state.calls.length = 0;
  state.watchResult = { status: 'ok' };
  state.upgradeResult = { status: 'ok' };
  state.room = null;
  state.messages = [];
  state.evidence = [];
  state.stats = null;
  state.watchError = null;
  state.roomError = null;
}

/** Every `watch_arena_room` invocation the hook made. */
function watchCalls() {
  return state.calls.filter((c) => c.name === 'watchRoom');
}

function callNames() {
  return state.calls.map((c) => c.name);
}

function record(name, args) {
  state.calls.push({ name, args });
}

const ok = (name) => (v) => {
  record(name, v);
  return v;
};

/* --- react-native boundary ------------------------------------------------ */
const noop = () => {};
const View = 'View';
const Text = 'Text';

/* --- expo-router boundary ------------------------------------------------- */
const router = {
  push: ok('router.push'),
  replace: ok('router.replace'),
  back: ok('router.back'),
  canGoBack: () => false,
};

const useFocusEffect = (cb) => {
  // Run the focus effect once, like a screen gaining focus on mount.
  const React = require('react');
  React.useEffect(() => {
    const cleanup = cb();
    return typeof cleanup === 'function' ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

/* --- clash context boundary ----------------------------------------------- */
const notices = [];
/* One constant for both halves: the action the boundary hands out and the type
 * the dispatch recorder filters on. They drifted apart once and made a correct
 * product refusal look like a missing notice. */
const NOTICE = 'ui/notice';
/** Same shape as `store/actions.ts: showNotice`. */
const showNotice = (message) => ({ type: NOTICE, message });
function useClash() {
  return {
    state: { viewer: { id: 'viewer-1' } },
    dispatch: (action) => {
      if (action && action.type === NOTICE) notices.push(action);
      return action;
    },
  };
}

/* --- liveArenaService boundary -------------------------------------------- */
async function fetchRoom(roomId) {
  record('fetchRoom', { roomId });
  if (state.roomError) throw state.roomError;
  return state.room;
}
async function fetchEvidence(roomId) {
  record('fetchEvidence', { roomId });
  return state.evidence;
}
async function fetchMindshiftStats(roomId) {
  record('fetchMindshiftStats', { roomId });
  return state.stats;
}
async function fetchVisibleMessageIds(roomId) {
  record('fetchVisibleMessageIds', { roomId });
  return [];
}
async function fetchEvidenceVisibility(roomId) {
  record('fetchEvidenceVisibility', { roomId });
  return [];
}
async function fetchMessage(id) {
  record('fetchMessage', { id });
  return null;
}
async function fetchOfficialPage(...args) {
  record('fetchOfficialPage', args[0] || {});
  return { messages: state.messages, cursor: null, hasMore: false };
}

/**
 * The operation under test. Records the call *before* deciding the outcome, so
 * "zero RPC calls" is provable rather than inferred.
 */
async function watchRoom(roomId) {
  record('watchRoom', { roomId });
  if (state.watchError) throw state.watchError;
  return state.watchResult;
}

async function upgradeSpectator(roomId, stance) {
  record('upgradeSpectator', { roomId, stance });
  if (state.upgradeError) throw state.upgradeError;
  return state.upgradeResult;
}

const passthrough = (name) =>
  async (...args) => {
    record(name, args[0]);
    return null;
  };

function subscribeRoomMessages() {
  record('subscribeRoomMessages', {});
  return () => {};
}

/* --- supabaseClient boundary ---------------------------------------------- */
class SupabaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
  }
}

function currentUserId() {
  return 'viewer-1';
}

function errorText(err) {
  if (!err) return null;
  return err.message || String(err);
}

module.exports = {
  state,
  reset,
  watchCalls,
  callNames,
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
  notices,
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
