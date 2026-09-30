import React from 'react';
import { Tabs } from 'expo-router';
import { RealmPortal } from '../../components/navigation/RealmPortal';
import { RealmTabBar } from '../../components/navigation/RealmTabBar';
import { AppSidebar } from '../../components/navigation/AppSidebar';
import { SidebarProvider } from '../../components/navigation/SidebarContext';
import { useRealmSwitch } from '../../components/navigation/useRealmSwitch';
import { NotificationUnreadProvider } from '../../store/NotificationUnreadProvider';
import { VaultIcon } from '../../components/shared/icons';
import { REALM_ROUTES } from '../../components/navigation/realmRoutes';
import { useThemeColors } from '../../theme';

/** Arena realm navigation: home, explore, create, notifications, and profile. */
export default function TabsLayout(): React.JSX.Element {
  const { shifting, first, direction, shiftTo } = useRealmSwitch();
  const theme = useThemeColors();
  return (
    <SidebarProvider>
      <NotificationUnreadProvider>
        <Tabs
          tabBar={(props) => {
            const focused = props.state.routes[props.state.index]?.name;
            // Create is a focused composer — hide the floating dock so CTAs never collide.
            if (focused === 'create') return null;
            return (
              <RealmTabBar
                {...props}
                realm="arena"
                onShiftRealm={(realm) => shiftTo(realm, REALM_ROUTES.vaultHome)}
                shiftLabel="VAULT"
                ShiftIcon={VaultIcon}
              />
            );
          }}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
          <Tabs.Screen name="create" options={{ title: 'Create' }} />
          <Tabs.Screen name="notifications" options={{ title: 'Activity' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </NotificationUnreadProvider>
      <AppSidebar />
      {shifting ? <RealmPortal direction={direction} first={first} onDone={() => undefined} /> : null}
    </SidebarProvider>
  );
}
