import React from 'react';
import { Tabs } from 'expo-router';
import { RealmPortal } from '../../components/navigation/RealmPortal';
import { RealmTabBar } from '../../components/navigation/RealmTabBar';
import { useRealmSwitch } from '../../components/navigation/useRealmSwitch';
import { REALM_ROUTES } from '../../components/navigation/realmRoutes';
import { ArenaIcon } from '../../components/shared/icons';
import { color } from '../../theme';

/** Vault tab group (spec §17–§23): Home · Creators · Radar · Analytics · Profile. */
export default function VaultLayout(): React.JSX.Element {
  const { shifting, first, direction, shiftTo } = useRealmSwitch();
  return (
    <>
      <Tabs
        tabBar={(props) => (
          <RealmTabBar
            {...props}
            realm="vault"
            onShiftRealm={(realm) => shiftTo(realm, REALM_ROUTES.arenaHome)}
            shiftLabel="ARENA"
            ShiftIcon={ArenaIcon}
          />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Vault' }} />
        <Tabs.Screen name="creators" options={{ title: 'Creators' }} />
        <Tabs.Screen name="radar" options={{ title: 'Radar' }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      {shifting ? <RealmPortal direction={direction} first={first} onDone={() => undefined} /> : null}
    </>
  );
}
