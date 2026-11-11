import React from 'react';
import { fetchInterestCatalogue, fetchMyArenaInterests, saveMyArenaInterests } from '../../services/arenaInterestService';
import { useOperationScope } from '../../hooks/useOperationScope';
import { useAuth } from '../../store/AuthProvider';
import { useClash } from '../../store';
import { validInterestSelection, type ArenaInterest, type ArenaInterestPreferences } from '../../utils/arenaInterests';
import { notify } from '../../utils/haptics';

interface EditorState {
  scope: () => boolean; catalogue: ArenaInterest[]; preferences: ArenaInterestPreferences | null;
  selected: string[]; dirty: boolean; loading: boolean; saving: boolean; error: string | null; needsReload: boolean; lastSkip: boolean;
}
const initial = (scope: () => boolean): EditorState => ({ scope, catalogue: [], preferences: null,
  selected: [], dirty: false, loading: true, saving: false, error: null, needsReload: false, lastSkip: false });

/** Drafts are local to this mounted account. Only a confirmed server response completes onboarding. */
export function useArenaInterestEditor(onSaved: (prefs: ArenaInterestPreferences, wasIncomplete?: boolean) => void, onBack?: () => void) {
  const { user } = useAuth(), { reloadArena } = useClash();
  const isCurrent = useOperationScope(user?.id ?? 'guest');
  const [stored, setStored] = React.useState(() => initial(isCurrent));
  const [retry, setRetry] = React.useState(0);
  const operation = React.useRef({ scope: isCurrent, loading: false, saving: false, exited: false, completed: false, read: 0, intent: 0 });
  if (operation.current.scope !== isCurrent) operation.current = { scope: isCurrent, loading: false, saving: false, exited: false, completed: false, read: 0, intent: 0 };
  const ticket = operation.current;
  const intent = ticket.intent;
  const active = (): boolean => isCurrent() && operation.current === ticket && !ticket.exited && !ticket.completed;
  const state = stored.scope === isCurrent ? stored : initial(isCurrent);
  React.useEffect(() => {
    if (!user) { setStored({ ...initial(isCurrent), loading: false }); return; }
    const request = ++ticket.read; ticket.loading = true;
    setStored(previous => ({ ...(previous.scope === isCurrent ? previous : initial(isCurrent)), loading: true, error: null }));
    void Promise.all([fetchInterestCatalogue(), fetchMyArenaInterests(user.id)]).then(([catalogue, preferences]) => {
      if (!active() || request !== ticket.read) return;
      setStored(previous => ({ ...previous, catalogue, preferences, needsReload: false,
        selected: previous.dirty ? previous.selected : preferences.topicIds }));
    }).catch(() => {
      if (active() && request === ticket.read) setStored(previous => ({ ...previous, error: 'Could not load your interests. Retry or continue without saving.' }));
    }).finally(() => {
      if (active() && request === ticket.read) { ticket.loading = false; setStored(previous => ({ ...previous, loading: false })); }
    });
    return () => { ticket.read++; ticket.loading = false; };
  }, [isCurrent, retry]);
  const reload = (): void => {
    if (!active() || ticket.loading || ticket.saving) return;
    ticket.loading = true; setRetry(value => value + 1);
  };
  const change = (selected: string[]): void => {
    if (isCurrent() && operation.current === ticket && !ticket.exited && !ticket.saving && !ticket.loading) {
      ticket.completed = false; ticket.intent++;
      setStored(previous => ({ ...previous, selected: [...selected], dirty: true }));
    }
  };
  const exit = (): void => {
    if (!isCurrent() || operation.current !== ticket || ticket.exited || !onBack) return;
    ticket.exited = true; onBack();
  };
  const save = async (skip: boolean): Promise<void> => {
    if (!active() || ticket.intent !== intent || ticket.saving || ticket.loading || !user || !state.preferences || (!skip && !validInterestSelection(state.selected))) return;
    ticket.saving = true; setStored(previous => ({ ...previous, saving: true, error: null, lastSkip: skip }));
    const wanted = skip ? [] : [...state.selected], wasIncomplete = state.preferences.version === 0;
    try {
      // A failed/ambiguous save is never automatically repeated. Explicit Retry rereads its revision first.
      const base = state.needsReload ? await fetchMyArenaInterests(user.id) : state.preferences;
      if (!active()) return;
      const alreadySaved = base.version >= 1 && base.skipped === skip && base.topicIds.length === wanted.length && wanted.every(id => base.topicIds.includes(id));
      const result = alreadySaved ? base : await saveMyArenaInterests(wanted, skip, base.revision, user.id, active);
      if (!active()) return;
      if (result.version < 1) throw new Error('Save not confirmed');
      setStored(previous => ({ ...previous, preferences: result, selected: result.topicIds, dirty: false, needsReload: false }));
      ticket.completed = true;
      notify('success'); void reloadArena().catch(() => undefined); onSaved(result, wasIncomplete);
    } catch (error) {
      if (!active()) return;
      const code = (error as { code?: string }).code;
      const message = code === '42501' ? 'Saving is not permitted for this account. Your selection is kept; you can retry or continue without saving.'
        : code === 'PT409' ? 'Saved interests changed. Retry checks the latest revision and keeps your selection.'
        : 'Save could not be confirmed. Your selection is kept. Retry checks saved interests before submitting again.';
      setStored(previous => ({ ...previous, error: message, needsReload: true }));
    } finally {
      if (isCurrent() && operation.current === ticket && !ticket.exited) {
        ticket.saving = false; ticket.intent++;
        setStored(previous => ({ ...previous, saving: false }));
      }
    }
  };
  return { ...state, user, reload, change, exit, save };
}
