/**
 * Brief floating event pill from real room state — not fabricated activity.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import type { LiveRoomEvent } from '../../utils/liveRoomEvents';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export interface LiveRoomEventBannerProps {
  event: LiveRoomEvent | null;
  onPress?: () => void;
}

function markFor(kind: LiveRoomEvent['kind']): string {
  switch (kind) {
    case 'final_arguments':
      return '⚔';
    case 'judging':
      return '⚖';
    case 'result':
      return '◆';
    case 'pulse_rising':
      return '↑';
    case 'backup_called':
      return '⚔';
    case 'backup_arrived':
      return '🛡';
    case 'backup_expired':
      return '·';
    case 'evidence_surge':
      return '🧾';
    case 'phase':
      return '·';
    case 'pulse_updated':
      return '·';
    default:
      return '·';
  }
}

export function LiveRoomEventBanner({
  event,
  onPress,
}: LiveRoomEventBannerProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  if (!event) return null;

  const body = (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(220)}
      exiting={reduced ? undefined : FadeOutUp.duration(160)}
      style={[
        styles.pill,
        {
          backgroundColor: t.surfaceElevated,
          borderColor: t.borderStrong,
          shadowColor: t.shadowColor,
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.mark, { color: t.textMuted }]}>
        {markFor(event.kind)}
      </Text>
      <Text allowFontScaling={false} style={[styles.text, { color: t.textPrimary }]}>
        {event.label}
      </Text>
    </Animated.View>
  );

  if (!onPress) {
    return <Animated.View style={styles.wrap}>{body}</Animated.View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={event.label}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 12,
    zIndex: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  mark: { ...typeScale.caption, fontSize: 12, fontWeight: '800' },
  text: { ...typeScale.caption, fontSize: 12, fontWeight: '800' },
});
