import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { IconButton } from '../shared/IconButton';
import { BellIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * Arena masthead (reference "Arena Home", screen 5): the CLASH wordmark on the
 * left, the viewer's avatar on the right. Nothing else competes for the eye.
 */
export function ArenaHeader(): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const router = useRouter();

  return (
    <View style={styles.wrap}>
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
        <Pressable
          onPress={() => {
            hapticTap();
            router.push('/(tabs)/profile');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open your profile, @${viewer.handle}`}
          style={styles.avatar}
        >
          <Avatar name={viewer.name} tint={viewer.tint} size={40} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: {
    ...typeScale.title,
    fontSize: 25,
    color: ink.primary,
    letterSpacing: 2.4,
  },
  avatar: { borderRadius: radius.pill },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
