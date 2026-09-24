import React from 'react';
import { Tabs } from 'expo-router';
import { RealmPortal } from '../../components/navigation/RealmPortal';
import { RealmTabBar } from '../../components/navigation/RealmTabBar';
import { useRealmSwitch } from '../../components/navigation/useRealmSwitch';
import { VaultIcon } from '../../components/shared/icons';
import { REALM_ROUTES } from '../../components/navigation/realmRoutes';
import { color } from '../../theme';

/** Arena realm navigation: home, explore, create, notifications, and profile. */
export default function TabsLayout(): React.JSX.Element {
  const { shifting, direction, shiftTo } = useRealmSwitch();
  return (
    <>
      <Tabs
        tabBar={(props) => (
          <RealmTabBar
            {...props}
            realm="arena"
            onShiftRealm={(realm) => shiftTo(realm, REALM_ROUTES.vaultHome)}
            shiftLabel="VAULT"
            ShiftIcon={VaultIcon}
          />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen name="create" options={{ title: 'Create' }} />
        <Tabs.Screen name="notifications" options={{ title: 'Activity' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      {shifting ? <RealmPortal direction={direction} onDone={() => undefined} /> : null}
    </>
  );
}

