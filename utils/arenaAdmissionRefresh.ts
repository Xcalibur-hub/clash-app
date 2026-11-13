/**
 * What a successful admission must do to the screen — decided outside React.
 *
 * ## The defect this encodes
 *
 * `watch_arena_room` succeeded, `room` was updated, and nothing else happened. The
 * transcript in `useLiveArenaRoom` is loaded by a layout effect keyed on the
 * **`roomId` prop**, and joining a room does not change its id. So the one visible
 * consequence of a successful Watch — being allowed to read the conversation — was
 * the one thing that did not occur. The viewer sat in front of a locked or empty
 * thread until they navigated away (`useFocusEffect`) or backgrounded the app
 * (`AppState`).
 *
 * This module exists so that rule is stated once, in a place a test can reach,
 * rather than living as an ordering detail inside a 1,000-line hook.
 *
 * ## Why order matters
 *
 * `refreshThread` must run before `load('refresh')`:
 *
 *   · A non-member's thread request was refused (42501), so `messageCursor` is
 *     still `null` and `initialCoverage` may hold an unacknowledged page. Only
 *     `refreshThread` resolves that obligation — it re-reads the retained ids and,
 *     for an *empty* rejected window, fetches a fresh accepted page and seeds the
 *     cursor from it.
 *   · `load('refresh')` re-reads the room, rail and rollups, but it does not
 *     repair cursors. Running it first would leave `messageCursor` null, which
 *     silently disables the gap drain (`if (messageCursor.current)`) — so realtime
 *     inserts after admission would never be gap-filled.
 */

/** The steps a successful admission must perform, in order. */
export type AdmissionSyncStep = 'refresh_thread' | 'load_refresh';

/**
 * The steps required after a membership grant.
 *
 * Always both, always in this order. There is no conditional here on purpose: a
 * variant that skips `refresh_thread` is precisely the bug, and the null-cursor
 * case is the *common* one for a newly admitted spectator, not an edge case.
 */
export function admissionSyncSteps(): readonly AdmissionSyncStep[] {
  return ['refresh_thread', 'load_refresh'];
}

/**
 * Whether a refused read still owes a transcript recovery pass.
 *
 * A 42501 on the thread leaves the cursors unset. Once membership is granted that
 * obligation must be discharged, or the room renders empty forever.
 */
export function owesCursorRecovery(state: {
  hasMessageCursor: boolean;
  hasInitialCoverage: boolean;
  wasRefused: boolean;
}): boolean {
  // The ordinary case: nothing was ever accepted because the read was refused.
  if (state.wasRefused && !state.hasMessageCursor) return true;
  // A retained window that was never acknowledged still needs discharging even
  // without an explicit refusal flag.
  return state.hasInitialCoverage && !state.hasMessageCursor;
}
