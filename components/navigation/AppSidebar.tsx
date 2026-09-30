/**
 * Floating charcoal drawer — primary CLASH destinations, spring open/close.
 */
import React from 'react';
import { BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { Avatar } from '../shared/Avatar';
import {
  ArenaHomeIcon,
  BellIcon,
  CloseIcon,
  CompassIcon,
  SettingsIcon,
  UserIcon,
  VaultIcon,
  WorldIcon,
} from '../shared/icons';
import { selectViewer, showNotice, useClash } from '../../store';
import { useRealmSwitch } from './useRealmSwitch';
import { REALM_ROUTES } from './realmRoutes';
import { useSidebar } from './SidebarContext';
import { DRAWER_ICON, DRAWER_TEXT_MUTED, sidebar as s } from './sidebarStyles';
import { tap as hapticTap } from '../../utils/haptics';

const CLOSE_MS = 200;

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  onPress: (closeThen: (run: () => void) => void) => void;
}

export function AppSidebar(): React.JSX.Element | null {
  const { isOpen, close } = useSidebar();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [visible, setVisible] = React.useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const { shiftTo } = useRealmSwitch();
  const { state, dispatch } = useClash();
  const viewer = selectViewer(state);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      if (reduced) {
        progress.value = 1;
      } else {
        progress.value = withSpring(1, { damping: 22, stiffness: 220, mass: 0.85 });
      }
    } else if (visible) {
      progress.value = withTiming(0, { duration: reduced ? 1 : CLOSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setVisible)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, visible, reduced]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panel = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t,
      transform: [
        { translateX: (1 - t) * -28 },
        { scale: 0.97 + t * 0.03 },
      ],
    };
  });

  const closeThen = React.useCallback(
    (run: () => void): void => {
      close();
      setTimeout(run, CLOSE_MS);
    },
    [close],
  );

  const navItems: NavItem[] = React.useMemo(
    () => [
      {
        key: 'arena',
        label: 'Arena',
        icon: ArenaHomeIcon,
        match: (path) =>
          path === '/' ||
          (path.includes('(tabs)') &&
            !path.includes('explore') &&
            !path.includes('profile') &&
            !path.includes('notifications') &&
            !path.includes('create')),
        onPress: (go) => go(() => router.replace(REALM_ROUTES.arenaHome)),
      },
      {
        key: 'explore',
        label: 'Explore',
        icon: CompassIcon,
        match: (path) => path.includes('explore'),
        onPress: (go) => go(() => router.push('/(tabs)/explore')),
      },
      {
        key: 'world',
        label: 'World',
        icon: WorldIcon,
        match: (path) => path.includes('world'),
        onPress: (go) => go(() => router.push('/world')),
      },
      {
        key: 'vault',
        label: 'Vault',
        icon: VaultIcon,
        match: (path) => path.includes('vault'),
        onPress: (go) => go(() => shiftTo('vault', REALM_ROUTES.vaultHome)),
      },
      {
        key: 'notifications',
        label: 'Notifications',
        icon: BellIcon,
        match: (path) => path.includes('notifications'),
        onPress: (go) => go(() => router.push('/(tabs)/notifications')),
      },
    ],
    [router, shiftTo],
  );

  const secondary: NavItem[] = React.useMemo(
    () => [
      {
        key: 'profile',
        label: 'Profile',
        icon: UserIcon,
        match: (path) => path.includes('profile'),
        onPress: (go) => go(() => router.push('/(tabs)/profile')),
      },
      {
        key: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        match: () => false,
        onPress: () => {
          hapticTap();
          dispatch(showNotice('Settings are not wired up yet.'));
        },
      },
    ],
    [dispatch, router],
  );

  if (!visible) return null;

  const panelMaxHeight = windowHeight - insets.top - insets.bottom - 36;

  return (
    <View style={s.root} pointerEvents="box-none">
      <Animated.View style={[s.scrim, scrim]}>
        <Pressable style={s.scrimTouch} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>
      <View style={[s.panelWrap, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
        <Animated.View
          style={[s.panel, panel, { maxHeight: panelMaxHeight }]}
          accessibilityViewIsModal
          accessibilityLabel="CLASH menu"
        >
          <View style={s.brandRow}>
            <Text allowFontScaling={false} style={s.brand}>
              CLASH
            </Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              hitSlop={10}
              style={{ padding: 6 }}
            >
              <CloseIcon size={18} color={DRAWER_TEXT_MUTED} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              hapticTap();
              closeThen(() => router.push('/(tabs)/profile'));
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open your profile, @${viewer.handle}`}
            style={({ pressed }) => [s.identity, pressed && s.pressed]}
          >
            <Avatar name={viewer.name} tint={viewer.tint} size={36} />
            <View style={s.identityText}>
              <Text allowFontScaling={false} style={s.name} numberOfLines={1}>
                {viewer.name}
              </Text>
              <Text allowFontScaling={false} style={s.handle} numberOfLines={1}>
                @{viewer.handle}
              </Text>
            </View>
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
            <View style={s.navBlock}>
              {navItems.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  active={item.match(pathname)}
                  onPress={() => {
                    hapticTap();
                    item.onPress(closeThen);
                  }}
                />
              ))}
            </View>
            <View style={s.divider} />
            <View style={s.navBlock}>
              {secondary.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  active={item.match(pathname)}
                  onPress={() => {
                    if (item.key === 'settings') {
                      item.onPress(closeThen);
                      return;
                    }
                    hapticTap();
                    item.onPress(closeThen);
                  }}
                />
              ))}
            </View>
            <View style={s.footer}>
              <Text allowFontScaling={false} style={s.version}>
                CLASH 2.0.0
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

function NavRow({
  item,
  active,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const Icon = item.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      style={({ pressed }) => [s.row, active && s.rowActive, pressed && s.pressed]}
    >
      <Icon size={22} color={DRAWER_ICON} strokeWidth={1.9} />
      <Text allowFontScaling={false} style={s.rowLabel} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}
