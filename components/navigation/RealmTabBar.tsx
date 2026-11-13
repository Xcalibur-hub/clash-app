import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, radius, space, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaHomeIcon } from '../shared/icons';
import type { Realm } from '../../store';
import { useNotificationUnread } from '../../store/NotificationUnreadProvider';
import { ARENA_TABS, VAULT_TABS, type TabRoute } from './dockConfig';
import {
  CREATE_DISC,
  DOCK_LABEL_LINE,
  PLATE_HEIGHT,
  SHIFT_WIDTH,
  dockLabelVisible,
} from './dockMetrics';
import { AppText } from '../shared/AppText';

export interface RealmTabBarProps extends BottomTabBarProps {
  realm: Realm;
  onShiftRealm: (realm: Realm) => void;
  shiftLabel: string;
  ShiftIcon: LucideIcon;
}

/**
 * Geometry lives in `dockMetrics.ts` (pure, unit-tested). `DOCK_HEIGHT` in
 * `dockConfig.ts` is derived from `PLATE_HEIGHT` so scroll clearance follows
 * automatically.
 */

/**
 * AURA dock.
 *
 * The previous dock gave all five destinations identical weight — a row of five
 * equal glyphs inside a floating capsule — so nothing indicated where you were
 * or which action mattered. AURA gives the bar a hierarchy instead:
 *
 *   · the active destination is a filled *plate* with its label revealed,
 *   · inactive destinations are pure glyphs (label is announced, not drawn),
 *   · Create is a distinct solid disc, sized above the row, because it is the
 *     one action the product is named after,
 *   · the realm switch is a separate, quieter affordance on the edge.
 *
 * The plate uses the live theme surface rather than a hardcoded near-black, so
 * light mode is no longer a dark capsule over a white app.
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
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);

  React.useEffect(() => {
    if (realm !== 'arena') return;
    setKeyboardVisible(Keyboard.isVisible?.() ?? false);
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
      setKeyboardVisible(false);
    };
  }, [realm]);

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
    const isCreate = entry.label === '';
    const showBadge = route.name === 'notifications' && unread > 0;
    const iconColor = focused ? t.textPrimary : t.textMuted;

    if (isCreate) {
      return (
        <Pressable
          key={route.key}
          onPress={() => press(route, focused)}
          style={styles.tab}
          accessibilityRole="button"
          accessibilityLabel="Create a take"
          accessibilityHint="Opens the composer"
        >
          <View style={[styles.create, { backgroundColor: t.textPrimary }]}>
            <Icon size={21} color={t.background} strokeWidth={2.3} />
          </View>
        </Pressable>
      );
    }

    const showLabel = dockLabelVisible(focused, isCreate);

    return (
      <Pressable
        key={route.key}
        onPress={() => press(route, focused)}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={entry.label}
      >
        <View style={styles.iconSlot}>
          {focused ? (
            <View style={[styles.activePlate, { backgroundColor: t.brandSoft, borderColor: t.border }]} />
          ) : null}
          <Icon size={21} color={iconColor} strokeWidth={focused ? 2.1 : 1.75} />
        </View>
        {/*
          Blocker 6: the label was promised in this component's own docstring and
          never drawn. It is always *laid out* so the glyph row cannot jump as
          focus moves; only the active tab paints text.
        */}
        <View style={styles.labelSlot}>
          {showLabel ? (
            <AppText
              numberOfLines={1}
              style={[styles.label, { color: t.textPrimary }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {entry.label}
            </AppText>
          ) : null}
        </View>
        {showBadge ? (
          <View style={[styles.badge, { backgroundColor: t.danger, borderColor: t.surface }]} pointerEvents="none">
            <AppText fixed style={styles.badgeText}>
              {unread > 99 ? '99+' : String(unread)}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const shiftTarget: Realm = realm === 'vault' ? 'arena' : 'vault';

  if (realm === 'arena' && keyboardVisible) return <View />;

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.xs) }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.plate,
          elevation.overlay,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            shadowColor: t.shadowColor,
            shadowOpacity: t.scheme === 'dark' ? 0.5 : 0.14,
          },
        ]}
      >
        {state.routes.map(renderTab)}
        <View style={[styles.seam, { backgroundColor: t.divider }]} />
        <Pressable
          onPress={() => {
            hapticTap();
            onShiftRealm(shiftTarget);
          }}
          style={styles.shift}
          accessibilityRole="button"
          accessibilityLabel={realm === 'vault' ? 'Return to Arena' : 'Open The Vault'}
        >
          <ShiftIcon size={19} color={t.textMuted} strokeWidth={1.75} />
        </Pressable>
      </View>
      <AppText style={styles.srOnly} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {shiftLabel}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PLATE_HEIGHT,
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xxs,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  // Full plate height so the whole tab column is tappable, not just the glyph.
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  iconSlot: { width: 46, height: 26, alignItems: 'center', justifyContent: 'center' },
  labelSlot: { height: DOCK_LABEL_LINE, justifyContent: 'center', marginTop: 2 },
  label: { fontSize: 10, lineHeight: DOCK_LABEL_LINE, fontWeight: '600', letterSpacing: 0.1 },
  activePlate: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  create: {
    width: CREATE_DISC,
    height: CREATE_DISC,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seam: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: space.xxs },
  // Was `width: 40` — below the 48dp minimum on an affordance used constantly.
  shift: { width: SHIFT_WIDTH, alignItems: 'center', justifyContent: 'center', height: '100%' },
  badge: {
    position: 'absolute',
    top: 6,
    right: '22%',
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', lineHeight: 10 },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
