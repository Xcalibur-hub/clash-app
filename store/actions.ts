import type { ClashResult, Judgement, Realm, Take } from './types';
import type { ClashAction } from './reducer';

/** Typed action creators — screens never build action objects by hand. */

export const markOnboarded = (): ClashAction => ({ type: 'app/onboarded' });

export const switchRealm = (realm: Realm): ClashAction => ({ type: 'realm/switch', realm });

export const resolveClashAction = (
  clashId: string,
  judgement: Judgement,
  result: ClashResult,
): ClashAction => ({ type: 'clash/resolve', clashId, judgement, result });

export const toggleSave = (takeId: string): ClashAction => ({ type: 'take/save', takeId });

export const reactToTake = (takeId: string): ClashAction => ({ type: 'take/react', takeId });

/** Drop a brand-new Take (spec §7) — the store pays the +30 XP creation award. */
export const createTake = (take: Take): ClashAction => ({ type: 'take/create', take });

export const unlockDrop = (dropId: string): ClashAction => ({ type: 'vault/unlock', dropId });

export const setAnalytics = (unlocked: boolean): ClashAction => ({
  type: 'vault/analytics',
  unlocked,
});

export const showNotice = (message: string): ClashAction => ({ type: 'ui/notice', message });

export const clearNotice = (): ClashAction => ({ type: 'ui/notice', message: null });
