import React from 'react';
import {
  callBackup,
  cancelBackup,
  fetchBackupCandidates,
  fetchBackupPreference,
  fetchBattleEvents,
  fetchMyBackupInvites,
  fetchRoomLoad,
  respondBackup,
  setBackupPreference,
  type ArenaBackupAnswer,
  type ArenaBackupCandidate,
  type ArenaBackupInvite,
  type ArenaBattleEvent,
  type ArenaRoomLoad,
} from '../services/arenaGameService';
import { errorText } from '../services/supabaseClient';
import { showNotice, useClash } from '../store';
import type { ArenaBackupPolicy } from '../utils/arenaGameState';

export interface ArenaBackupController {
  candidates: ArenaBackupCandidate[];
  loadingCandidates: boolean;
  invites: ArenaBackupInvite[];
  activeInvite: ArenaBackupInvite | null;
  events: ArenaBattleEvent[];
  load: ArenaRoomLoad | null;
  policy: ArenaBackupPolicy;
  busy: boolean;
  refreshCandidates: () => Promise<void>;
  refreshInvites: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  call: (recipientId: string) => Promise<boolean>;
  answer: (
    inviteId: string,
    accept: boolean,
    stance?: 'AGREE' | 'UNSURE' | 'DISAGREE',
  ) => Promise<ArenaBackupAnswer | null>;
  setPolicy: (policy: ArenaBackupPolicy) => Promise<void>;
}

/**
 * Call Backup for one room.
 *
 * Nothing here is optimistically mutated: the server decides whether a call is
 * allowed, whether someone may enter a full room, and when a call expires. The
 * hook only reflects what came back, so the UI can be honest without effort.
 */
export function useArenaBackup(roomId: string | undefined): ArenaBackupController {
  const { dispatch } = useClash();
  const [candidates, setCandidates] = React.useState<ArenaBackupCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);
  const [invites, setInvites] = React.useState<ArenaBackupInvite[]>([]);
  const [events, setEvents] = React.useState<ArenaBattleEvent[]>([]);
  const [load, setLoad] = React.useState<ArenaRoomLoad | null>(null);
  const [policy, setPolicyState] = React.useState<ArenaBackupPolicy>('EVERYONE');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!roomId) return undefined;
    let alive = true;
    void fetchRoomLoad(roomId).then((next) => {
      if (alive) setLoad(next);
    });
    void fetchBackupPreference()
      .then((next) => {
        if (alive) setPolicyState(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [roomId]);

  const refreshCandidates = React.useCallback(async (): Promise<void> => {
    if (!roomId) return;
    setLoadingCandidates(true);
    try {
      setCandidates(await fetchBackupCandidates(roomId, 5));
    } catch {
      // Not being eligible to call anyone is a normal state, not an error.
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, [roomId]);

  const refreshInvites = React.useCallback(async (): Promise<void> => {
    try {
      setInvites(await fetchMyBackupInvites());
    } catch {
      setInvites([]);
    }
  }, []);

  const refreshEvents = React.useCallback(async (): Promise<void> => {
    if (!roomId) return;
    try {
      setEvents(await fetchBattleEvents(roomId, null, 20));
    } catch {
      setEvents([]);
    }
  }, [roomId]);

  React.useEffect(() => {
    void refreshCandidates();
    void refreshInvites();
    void refreshEvents();
  }, [refreshCandidates, refreshInvites, refreshEvents]);

  const call = React.useCallback(
    async (recipientId: string): Promise<boolean> => {
      if (!roomId) return false;
      setBusy(true);
      try {
        await callBackup(roomId, recipientId);
        dispatch(showNotice('Backup called.'));
        await Promise.all([refreshCandidates(), refreshEvents()]);
        return true;
      } catch (error) {
        dispatch(showNotice(errorText(error)));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [dispatch, refreshCandidates, refreshEvents, roomId],
  );

  const answer = React.useCallback(
    async (
      inviteId: string,
      accept: boolean,
      stance?: 'AGREE' | 'UNSURE' | 'DISAGREE',
    ): Promise<ArenaBackupAnswer | null> => {
      setBusy(true);
      try {
        const result = await respondBackup(inviteId, accept, stance);
        // The server's answer is the message: full rooms and expired calls are
        // reported as they are, never smoothed over.
        if (result.status === 'room_full') dispatch(showNotice('That room is full.'));
        if (result.status === 'EXPIRED') dispatch(showNotice('That call expired.'));
        if (result.status === 'ACCEPTED') dispatch(showNotice('Backup arrived.'));
        await Promise.all([refreshInvites(), refreshEvents()]);
        return result;
      } catch (error) {
        dispatch(showNotice(errorText(error)));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [dispatch, refreshEvents, refreshInvites],
  );

  const setPolicy = React.useCallback(
    async (next: ArenaBackupPolicy): Promise<void> => {
      try {
        setPolicyState(await setBackupPreference(next));
        await refreshInvites();
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      }
    },
    [dispatch, refreshInvites],
  );

  return {
    candidates,
    loadingCandidates,
    invites,
    activeInvite: invites[0] ?? null,
    events,
    load,
    policy,
    busy,
    refreshCandidates,
    refreshInvites,
    refreshEvents,
    call,
    answer,
    setPolicy,
  };
}
