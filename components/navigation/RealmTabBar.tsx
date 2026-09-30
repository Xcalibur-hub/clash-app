import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaHomeIcon } from '../shared/icons';
import type { Realm } from '../../store';
import { useNotificationUnread } from '../../store/NotificationUnreadProvider';
import { ARENA_TABS, VAULT_TABS, type TabRoute } from './dockConfig';

export interface RealmTabBarProps extends BottomTabBarProps {
  realm: Realm;
  onShiftRealm: (realm: Realm) => void;
  shiftLabel: string;
  ShiftIcon: LucideIcon;
}

const DOCK_BG = '#111113';
const DOCK_ICON = 'rgba(255,255,255,0.5)';
const DOCK_ICON_ON = '#111113';

/**
 * Slim floating capsule — secondary to content, never competing with the hero.
 */
export function RealmTabBar({
  state,
  navigation,
  realm,
  onShiftRealm,
  shiftLabel,
  ShiftIcon,
}: RealmTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { unread } = useNotificationUnread();
  const tabs = realm === 'vault' ? VAULT_TABS : ARENA_TABS;
  const activeKey = state.routes[state.index]?.key;

  const press = (route: TabRoute, focused: boolean): void => {
    hapticTap();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const renderTab = (route: TabRoute): React.JSX.Element => {
    const entry = tabs[route.name] ?? { label: route.name, icon: ArenaHomeIcon };
    const focused = route.key === activeKey;
    const Icon = entry.icon;
    const centred = entry.label === '';
    const showBadge = route.name === 'notifications' && unread > 0;
    return (
      <Pressable
        key={route.key}
        onPress={() => press(route, focused)}
        style={styles.tab}
        accessibilityRole={centred ? 'button' : 'tab'}
        accessibilityState={centred ? undefined : { selected: focused }}
        accessibilityLabel={centred ? 'Create a take' : entry.label}
      >
        {centred ? (
          <View style={styles.create}>
            <Icon size={18} color={DOCK_ICON_ON} strokeWidth={2.6} />
          </View>
        ) : (
          <View style={styles.iconWrap}>
            <View style={[styles.activeHalo, focused && styles.activeHaloOn]}>
              <Icon
                size={18}
                color={focused ? DOCK_ICON_ON : DOCK_ICON}
                strokeWidth={focused ? 2.4 : 2}
              />
            </View>
            {showBadge ? (
              <View style={[styles.badge, { backgroundColor: t.danger }]} pointerEvents="none">
                <Text allowFontScaling={false} style={styles.badgeText}>
                  {unread > 99 ? '99+' : String(unread)}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    );
  };

  const shiftTarget: Realm = realm === 'vault' ? 'arena' : 'vault';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.dock}>
        {state.routes.map(renderTab)}
        <Pressable
          onPress={() => {
            hapticTap();
            onShiftRealm(shiftTarget);
          }}
          style={styles.shift}
          accessibilityRole="button"
          accessibilityLabel={realm === 'vault' ? 'Return to Arena' : 'Open The Vault'}
        >
          <ShiftIcon size={18} color={DOCK_ICON} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={styles.srOnly} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {shiftLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 42,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    width: '100%',
    maxWidth: 320,
    borderRadius: 999,
    backgroundColor: DOCK_BG,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  create: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  iconWrap: { position: 'relative' },
  activeHalo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeHaloOn: {
    backgroundColor: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: -5,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: DOCK_BG,
  },
  badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', lineHeight: 10 },
  shift: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
