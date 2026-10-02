import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { SearchIcon } from '../shared/icons';
import { useSidebar } from '../navigation/SidebarContext';

export interface ArenaTopBarProps {
  paddingTop: number;
}

/**
 * Minimal Arena chrome — brand + circular actions.
 * Hero content (Today's Arena) should appear immediately below.
 */
export function ArenaTopBar({ paddingTop }: ArenaTopBarProps): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();
  const t = useThemeColors();

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + 2 }]}>
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
          <Avatar name={viewer.name} tint={viewer.tint} size={32} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    ...typeScale.label,
    fontSize: 15,
    letterSpacing: 1.8,
    fontWeight: '800',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
