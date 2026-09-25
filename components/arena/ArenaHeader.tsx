import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { IconButton } from '../shared/IconButton';
import { BellIcon, MenuIcon } from '../shared/icons';
import { useSidebar } from '../navigation/SidebarContext';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * Arena masthead: menu button left, CLASH wordmark centred, activity right.
 * The avatar moves into the slide-out sidebar identity block.
 */
export function ArenaHeader(): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const { open } = useSidebar();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          hapticTap();
          open();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        style={styles.menu}
      >
        <Avatar name={viewer.name} tint={viewer.tint} size={40} />
        <View pointerEvents="none" style={styles.menuBadge}>
          <MenuIcon size={13} color={ink.primary} strokeWidth={2.6} />
        </View>
      </Pressable>
      <Text allowFontScaling={false} style={styles.brand}>
        CLASH
      </Text>
      <View style={styles.actions}>
        <IconButton
          icon={BellIcon}
          onPress={() => {
            hapticTap();
            router.push('/notifications');
          }}
          label="Open notifications"
          size={40}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menu: { borderRadius: radius.pill },
  menuBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  brand: {
    ...typeScale.title,
    fontSize: 25,
    color: ink.primary,
    letterSpacing: 2.4,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
