import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClash } from '../../store';
import { duration, glassBorder, ink, radius, space, typeScale } from '../../theme';

/**
 * Single-line prototype feedback ("Saved to your shelf."). Driven by the store
 * so any screen can post a notice without owning toast state.
 */
export function Notice({ offset = 0 }: { offset?: number }): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const notice = state.notice;

  if (!notice) return <View />;

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base)}
      exiting={FadeOutDown.duration(duration.fast)}
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + offset + space.xl }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={notice.message}
    >
      <View style={styles.pill}>
        <Text allowFontScaling={false} style={styles.text}>
          {notice.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glassBorder.strong,
    backgroundColor: 'rgba(18,18,24,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  text: { ...typeScale.label, color: ink.primary, textAlign: 'center' },
});
