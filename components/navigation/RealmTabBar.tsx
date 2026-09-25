import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { action, apple, card, ink, radius, space } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaHomeIcon } from '../shared/icons';
import type { Realm } from '../../store';
import { ARENA_TABS, DOCK_HEIGHT, VAULT_TABS, type TabRoute } from './dockConfig';

export interface RealmTabBarProps extends BottomTabBarProps {
  realm: Realm;
  onShiftRealm: (realm: Realm) => void;
  shiftLabel: string;
  ShiftIcon: LucideIcon;
}

/**
 * The clean native-standard dock (PRD §13, §35): five slots — Home, Explore,
 * a centred Create, Activity, Profile — icon over label, white when active and
 * muted otherwise. No glow, no gold dots, no elevation; the Create button is a
 * plain white circle so it reads as familiar chrome, not a floating effect.
 */
export function RealmTabBar({ state, navigation, realm, onShiftRealm, shiftLabel, ShiftIcon }: RealmTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
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
            <Icon size={20} color={action.text} strokeWidth={2.6} />
          </View>
        ) : (
          <Icon
            size={24}
            color={focused ? ink.primary : ink.tertiary}
            strokeWidth={focused ? 2.5 : 2}
          />
        )}
        {entry.label ? (
          <Text
            allowFontScaling={false}
            style={[styles.tabLabel, focused && styles.tabLabelActive]}
          >
            {entry.label}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const shiftTarget: Realm = realm === 'vault' ? 'arena' : 'vault';

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
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
          <ShiftIcon size={24} color={ink.tertiary} strokeWidth={2} />
          <Text allowFontScaling={false} style={styles.tabLabel}>
            {shiftLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: 'transparent', paddingHorizontal: space.md },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_HEIGHT,
    backgroundColor: apple.dock,
    borderWidth: 1,
    borderColor: apple.cardBorder,
    borderRadius: 28,
    paddingHorizontal: space.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.xs,
  },
  create: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: action.fill,
  },
  shift: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.xs,
    borderLeftWidth: 1,
    borderLeftColor: card.border,
  },
  tabLabel: { fontSize: 10, color: ink.tertiary, fontWeight: '500' },
  tabLabelActive: { color: ink.primary, fontWeight: '600' },
});
