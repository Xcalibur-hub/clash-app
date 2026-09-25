import React from 'react';
import { useRouter } from 'expo-router';
import { switchRealm, useClash, type Realm } from '../../store';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { REALM_SHIFT_MS, REALM_SHIFT_REPEAT_MS, type RealmDirection } from './RealmPortal';

interface RealmSwitch {
  /** True while the §14 portal/crossfade is on screen. */
  shifting: boolean;
  /** True for the session's first shift — the expressive bloom, not a repeat. */
  first: boolean;
  direction: RealmDirection;
  realm: Realm;
  shiftTo: (realm: Realm, href?: string) => void;
}

/** Module scope: the first shift of a session blooms, repeats crossfade (spec §14). */
let sessionShifted = false;

/**
 * Realm Switch (spec §14): Arena ⇄ Vault replaces the whole tab group, never
 * stacks tabs. The portal covers the router swap so the cut reads as entering
 * another world — but only the first shift of a session is expressive; repeat
 * switches are a quiet 240ms crossfade.
 */
export function useRealmSwitch(): RealmSwitch {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const [shifting, setShifting] = React.useState(false);
  const [first, setFirst] = React.useState(true);
  const [direction, setDirection] = React.useState<RealmDirection>('arena-to-vault');

  const shiftTo = React.useCallback(
    (realm: Realm, href?: string): void => {
      if (realm === state.realm) {
        if (href) router.replace(href as never);
        return;
      }
      hapticTap();
      const isFirst = !sessionShifted;
      sessionShifted = true;
      setFirst(isFirst);
      setDirection(realm === 'vault' ? 'arena-to-vault' : 'vault-to-arena');
      setShifting(true);
      dispatch(switchRealm(realm));
      const ms = isFirst ? REALM_SHIFT_MS : REALM_SHIFT_REPEAT_MS;
      const swapAt = isFirst ? REALM_SHIFT_MS - 160 : REALM_SHIFT_REPEAT_MS - 100;
      setTimeout(() => {
        hapticPress();
        if (href) router.replace(href as never);
      }, swapAt);
      setTimeout(() => setShifting(false), ms + 40);
    },
    [dispatch, router, state.realm],
  );

  return { shifting, first, direction, realm: state.realm, shiftTo };
}
