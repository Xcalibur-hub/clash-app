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

/** Arena masthead — theme-aware wordmark with a sparse underline accent. */
export function ArenaTopBar({ paddingTop }: ArenaTopBarProps): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();
  const t = useThemeColors();

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + space.xs }]}>
      <View style={styles.brandWrap}>
        <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
          CLASH
        </Text>
        <Underline size={72} opacity={0.35} color={t.textPrimary} style={styles.underline} />
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
          style={styles.icon}
        >
          <SearchIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  brandWrap: { position: 'relative', paddingBottom: 4 },
  brand: {
    ...typeScale.title,
    fontSize: 22,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  underline: { position: 'absolute', bottom: -2, left: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
