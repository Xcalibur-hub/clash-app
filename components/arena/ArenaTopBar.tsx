import React from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { selectViewer, useClash } from '../../store';
import { space, typeScale, useTheme, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { SearchIcon } from '../shared/icons';
import { useSidebar } from '../navigation/SidebarContext';

export interface ArenaTopBarProps {
  paddingTop: number;
  /** Optional context line under the brand. */
  contextLine?: string;
}

/**
 * Arena brand hero chrome — large CLASH mark + light actions.
 */
export function ArenaTopBar({
  paddingTop,
  contextLine = 'Where the internet takes sides.',
}: ArenaTopBarProps): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();
  const t = useThemeColors();
  const { scheme } = useTheme();
  const reduced = useReducedMotion();

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + 4 }]}>
      <View style={styles.brandBlock}>
        <Animated.Text
          entering={reduced ? undefined : FadeIn.duration(280)}
          style={[styles.brand, { color: t.textPrimary }]}
          accessibilityRole="header"
        >
          CLASH
        </Animated.Text>
        <View style={[styles.brandDot, { backgroundColor: scheme === 'dark' ? '#DDB1E8' : '#EB634E' }]} />
        {contextLine ? (
          <Animated.Text
            entering={reduced ? undefined : FadeIn.delay(80).duration(320)}
            style={[styles.context, { color: t.textMuted }]}
            numberOfLines={1}
          >
            {contextLine}
          </Animated.Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            hapticTap();
            router.push('/explore');
          }}
          accessibilityRole="button"
          accessibilityLabel="Search CLASH"
          hitSlop={8}
          style={[styles.iconBtn, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
        >
          <SearchIcon size={16} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          onPress={() => {
            hapticTap();
            open();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={8}
        >
          <Avatar name={viewer.name} tint={viewer.tint} size={34} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  brandBlock: { flex: 1, minWidth: 0, gap: 2, paddingRight: space.sm },
  brand: {
    ...typeScale.title,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1.2,
    fontWeight: '800',
  },
  context: {
    ...typeScale.caption,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  brandDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, left: 120, top: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
