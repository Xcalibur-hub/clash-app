import React from 'react';
import { Tabs } from 'expo-router';
import { RealmPortal } from '../../components/navigation/RealmPortal';
import { RealmTabBar } from '../../components/navigation/RealmTabBar';
import { useRealmSwitch } from '../../components/navigation/useRealmSwitch';
import { REALM_ROUTES } from '../../components/navigation/realmRoutes';
import { ArenaIcon } from '../../components/shared/icons';
import { useThemeColors } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockViewportInset } from '../../components/navigation/dockConfig';

/** Vault realm: Creator Worlds, Collections studio, Profile. */
export default function VaultLayout(): React.JSX.Element {
  const { shifting, first, direction, shiftTo } = useRealmSwitch();
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
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
          sceneStyle: { backgroundColor: t.background, paddingBottom: dockViewportInset(insets.bottom) },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Worlds' }} />
        <Tabs.Screen name="collections" options={{ title: 'Collections' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      {shifting ? <RealmPortal direction={direction} first={first} onDone={() => undefined} /> : null}
    </>
  );
}
