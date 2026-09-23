import React from 'react';
import { useRouter } from 'expo-router';
import { switchRealm, useClash, type Realm } from '../../store';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { REALM_SHIFT_MS, type RealmDirection } from './RealmPortal';

interface RealmSwitch {
  /** True while the §16 portal bloom is on screen. */
  shifting: boolean;
  direction: RealmDirection;
  realm: Realm;
  shiftTo: (realm: Realm, href?: string) => void;
}

/**
 * Realm Switch (spec §16, §23): Arena ⇄ Vault replaces the whole tab group,
 * never stacks tabs. The portal bloom covers the router swap (~660ms total)
 * so the cut reads as entering another world.
 */
export function useRealmSwitch(): RealmSwitch {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const [shifting, setShifting] = React.useState(false);
  const [direction, setDirection] = React.useState<RealmDirection>('arena-to-vault');
  const pending = React.useRef<{ realm: Realm; href?: string } | null>(null);

  const shiftTo = React.useCallback(
    (realm: Realm, href?: string): void => {
      if (realm === state.realm) {
        if (href) router.replace(href as never);
        return;
      }
      hapticTap();
      pending.current = { realm, href };
      setDirection(realm === 'vault' ? 'arena-to-vault' : 'vault-to-arena');
      setShifting(true);
      dispatch(switchRealm(realm));
      setTimeout(() => {
        hapticPress();
        if (href) router.replace(href as never);
      }, REALM_SHIFT_MS - 160);
      setTimeout(() => {
        pending.current = null;
        setShifting(false);
      }, REALM_SHIFT_MS + 60);
    },
    [dispatch, router, state.realm],
  );

  return { shifting, direction, realm: state.realm, shiftTo };
}
