/** In-session Teleport dedupe history — no private content ids logged externally. */

const TELEPORT_HISTORY_MAX = 24;
let teleportHistoryMemory: string[] = [];

export function readTeleportHistory(): string[] {
  return [...teleportHistoryMemory];
}

export function rememberTeleportId(id: string): void {
  teleportHistoryMemory = [id, ...teleportHistoryMemory.filter((x) => x !== id)].slice(
    0,
    TELEPORT_HISTORY_MAX,
  );
}

export function clearTeleportHistory(): void {
  teleportHistoryMemory = [];
}
