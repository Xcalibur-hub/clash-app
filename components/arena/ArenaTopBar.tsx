import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { SearchIcon } from '../shared/icons';
import { useSidebar } from '../navigation/SidebarContext';

export interface ArenaTopBarProps {
  paddingTop: number;
}

/**
 * Arena masthead: restrained CLASH wordmark, a search shortcut and the viewer
 * avatar (which opens the slide-out menu). Flat, no glow, no chrome.
 */
export function ArenaTopBar({ paddingTop }: ArenaTopBarProps): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + space.xs }]}>
      <Text allowFontScaling={false} style={styles.brand}>
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
          style={styles.icon}
        >
          <SearchIcon size={22} color={ink.primary} strokeWidth={2.2} />
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
  brand: {
    ...typeScale.title,
    fontSize: 20,
    letterSpacing: 0.4,
    color: ink.primary,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
