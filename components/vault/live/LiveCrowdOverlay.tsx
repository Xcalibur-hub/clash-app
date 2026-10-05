import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import type { LiveBanner } from '../../../utils/creatorLiveEvents';
import { liveActionLabel } from '../../../utils/creatorLiveState';
import { radius, space, typeScale } from '../../../theme';

export interface LiveCrowdOverlayProps {
  banner: LiveBanner | null;
}

/**
 * A triggered crowd action, announced over the stage for a few seconds.
 *
 * Only a creator-preconfigured identifier ever reaches here — never a URL,
 * command, device id or free-form payload — and the animation respects the
 * system's reduced-motion setting.
 */
export function LiveCrowdOverlay({ banner }: LiveCrowdOverlayProps): React.JSX.Element | null {
  const reduced = useReducedMotion();
  if (!banner || banner.kind !== 'ACTION_TRIGGERED') return null;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(220)}
      exiting={reduced ? undefined : FadeOut.duration(320)}
      pointerEvents="none"
      style={styles.wrap}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.plate}>
        <Text allowFontScaling={false} style={styles.label}>
          {banner.actionKind ? liveActionLabel(banner.actionKind).toUpperCase() : 'ACTION'}
        </Text>
        <Text allowFontScaling={false} style={styles.sub}>
          triggered by the crowd
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(10,10,12,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  label: { ...typeScale.title, fontSize: 20, fontWeight: '800', letterSpacing: 1.4, color: '#FFFFFF' },
  sub: { ...typeScale.caption, color: 'rgba(255,255,255,0.76)' },
});
