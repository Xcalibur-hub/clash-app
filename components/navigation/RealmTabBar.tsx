import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassBorder, ink, space, supportsBlur } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaHomeIcon } from '../shared/icons';
import type { Realm } from '../../store';
import { DockElevated } from './DockElevated';
import { DockTab } from './DockTab';
import {
  ARENA_TABS,
  BLUR,
  DOCK_HEIGHT,
  DOCK_RADIUS,
  ELEVATED_ROUTE,
  ELEVATED_SIZE,
  REALM_SLOT,
  VAULT_TABS,
  type TabRoute,
} from './dockConfig';

export interface RealmTabBarProps extends BottomTabBarProps {
  realm: Realm;
  onShiftRealm: (realm: Realm) => void;
  shiftLabel: string;
  ShiftIcon: LucideIcon;
}

/**
 * The floating glass dock (reference screens 5 & 23). Icon-first — no labels compete
 * with the feed — with a gold glow on the active tab, an elevated "+" for Take
 * Creation, and a discreet realm key that swaps Arena ⇄ Vault.
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
    return (
      <DockTab
        key={route.key}
        label={entry.label}
        icon={entry.icon}
        focused={focused}
        onPress={() => press(route, focused)}
      />
    );
  };

  const elevated = state.routes.find((route) => route.name === ELEVATED_ROUTE);
  const others = state.routes.filter((route) => route.name !== ELEVATED_ROUTE);
  const half = Math.ceil(others.length / 2);

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + space.sm }]}>
      <View style={styles.dock}>
        {supportsBlur ? (
          <BlurView intensity={BLUR} tint="dark" style={[StyleSheet.absoluteFill, styles.clip]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidFill]} />
        )}

        {/* Mirrors the realm key so the dock's content stays symmetrical. */}
        <View style={styles.slot} />

        {others.slice(0, half).map(renderTab)}
        <View style={styles.gap} />
        {others.slice(half).map(renderTab)}

        <Pressable
          onPress={() => onShiftRealm(realm === 'vault' ? 'arena' : 'vault')}
          accessibilityRole="button"
          accessibilityLabel={shiftLabel}
          style={styles.realmKey}
        >
          <ShiftIcon size={19} color={ink.tertiary} strokeWidth={2.4} />
        </Pressable>

        {elevated ? <DockElevated onPress={() => press(elevated, false)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: 'transparent' },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    borderWidth: 1,
    borderColor: glassBorder.regular,
    backgroundColor: 'rgba(12,12,17,0.72)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  clip: { borderRadius: DOCK_RADIUS, overflow: 'hidden' },
  androidFill: { backgroundColor: 'rgba(14,14,20,0.88)', borderRadius: DOCK_RADIUS },
  slot: { width: REALM_SLOT },
  gap: { width: ELEVATED_SIZE + space.sm },
  realmKey: {
    width: REALM_SLOT,
    height: DOCK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
