import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaHomeIcon } from '../shared/icons';
import type { Realm } from '../../store';
import { useNotificationUnread } from '../../store/NotificationUnreadProvider';
import { ARENA_TABS, DOCK_HEIGHT, VAULT_TABS, type TabRoute } from './dockConfig';

export interface RealmTabBarProps extends BottomTabBarProps {
  realm: Realm;
  onShiftRealm: (realm: Realm) => void;
  shiftLabel: string;
  ShiftIcon: LucideIcon;
}

/**
 * Floating premium dock — soft elevated surface, clear active state,
 * large central create. Adapted for CLASH (not a travel-app clone).
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
          <View style={[styles.create, { backgroundColor: t.clashFill }]}>
            <Icon size={20} color={t.clashText} strokeWidth={2.6} />
          </View>
        ) : (
          <View style={styles.iconWrap}>
            <View
              style={[
                styles.activeHalo,
                focused && { backgroundColor: t.scheme === 'light' ? t.surfaceMuted : 'rgba(255,255,255,0.08)' },
              ]}
            >
              <Icon
                size={22}
                color={focused ? t.textPrimary : t.textMuted}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
            {showBadge ? (
              <View style={[styles.badge, { backgroundColor: t.danger, borderColor: t.tabBar }]} pointerEvents="none">
                <Text allowFontScaling={false} style={styles.badgeText}>
                  {unread > 99 ? '99+' : String(unread)}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        {entry.label ? (
          <Text
            allowFontScaling={false}
            style={[styles.tabLabel, { color: focused ? t.textPrimary : t.textMuted, fontWeight: focused ? '600' : '500' }]}
          >
            {entry.label}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const shiftTarget: Realm = realm === 'vault' ? 'arena' : 'vault';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View
        style={[
          styles.dock,
          {
            backgroundColor: t.tabBar,
            borderColor: t.tabBarBorder,
            shadowColor: t.shadowColor,
            shadowOpacity: t.shadowOpacity,
          },
        ]}
      >
        {state.routes.map(renderTab)}
        <Pressable
          onPress={() => {
            hapticTap();
            onShiftRealm(shiftTarget);
          }}
          style={[styles.shift, { borderLeftColor: t.border }]}
          accessibilityRole="button"
          accessibilityLabel={realm === 'vault' ? 'Return to Arena' : 'Open The Vault'}
        >
          <ShiftIcon size={22} color={t.textMuted} strokeWidth={2} />
          <Text allowFontScaling={false} style={[styles.tabLabel, { color: t.textMuted }]}>
            {shiftLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    backgroundColor: 'transparent',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_HEIGHT + 4,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.xs,
  },
  create: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
  },
  iconWrap: { position: 'relative' },
  activeHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 12 },
  shift: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: 10 },
});
