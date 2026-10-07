/**
 * Spring entrance for canonical Fighter A / B identity.
 * Never derives order from roster — uses ArenaDuel fighters only.
 */
import React from 'react';
import Animated, { FadeInDown, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { ClashMatchupBar } from './ClashMatchupBar';

export interface AnimatedMatchupProps {
  duel: ArenaDuel;
  onOpenProfile?: (id: string) => void;
  highlightSide?: 'A' | 'B' | null;
  size?: 'card' | 'room' | 'stage';
}

export function AnimatedMatchup({
  duel,
  onOpenProfile,
  highlightSide = null,
  size = 'stage',
}: AnimatedMatchupProps): React.JSX.Element {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <ClashMatchupBar
        duel={duel}
        onOpenProfile={onOpenProfile}
        size={size}
        highlightSide={highlightSide}
      />
    );
  }
  return (
    <Animated.View entering={FadeInDown.springify().damping(18).stiffness(240)}>
      <Animated.View entering={ZoomIn.delay(80).springify().damping(16)}>
        <ClashMatchupBar
          duel={duel}
          onOpenProfile={onOpenProfile}
          size={size}
          highlightSide={highlightSide}
        />
      </Animated.View>
    </Animated.View>
  );
}
