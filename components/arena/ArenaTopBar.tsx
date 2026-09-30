import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { Underline } from '../shared/Doodles';
import { SearchIcon } from '../shared/icons';
import { useSidebar } from '../navigation/SidebarContext';

export interface ArenaTopBarProps {
  paddingTop: number;
}

/**
 * Compact brand row + editorial Arena proposition.
 * One composed hero opening — not a stacked dashboard.
 */
export function ArenaTopBar({ paddingTop }: ArenaTopBarProps): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();
  const t = useThemeColors();

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + 4 }]}>
      <View style={styles.brandRow}>
        <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
          CLASH
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              hapticTap();
              router.push('/explore');
            }}
            accessibilityRole="button"
            accessibilityLabel="Search CLASH"
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <SearchIcon size={17} color={t.textPrimary} strokeWidth={2.2} />
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
            <Avatar name={viewer.name} tint={viewer.tint} size={30} />
          </Pressable>
        </View>
      </View>
      <View style={styles.headlineWrap}>
        <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
          What's everyone{'\n'}talking about?
        </Text>
        <Underline size={88} color={t.textPrimary} opacity={0.22} style={styles.mark} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
    gap: space.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    ...typeScale.label,
    fontSize: 14,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headlineWrap: { position: 'relative', paddingBottom: 6 },
  headline: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  mark: { position: 'absolute', left: 0, bottom: -2 },
});
