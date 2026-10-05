import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  HOLD_TO_TALK_MAX_MS,
  HOLD_TO_TALK_MIN_MS,
  holdToTalkPhase,
} from '../../../utils/digitalCreatorState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface HoldToTalkControlProps {
  /** False when no recorder exists: the control says so instead of faking. */
  available: boolean;
  busy: boolean;
  note: string;
  onRelease: (heldMs: number, phase: 'too_short' | 'ready') => void;
}

/**
 * HOLD TO TALK.
 *
 * The control fails closed. If a build has no recorder it never shows a
 * listening state, never animates a waveform, and never invents a transcript —
 * the note underneath explains that text still works.
 */
export function HoldToTalkControl({
  available,
  busy,
  note,
  onRelease,
}: HoldToTalkControlProps): React.JSX.Element {
  const t = useThemeColors();
  const [held, setHeld] = React.useState(false);
  const startedAt = React.useRef<number | null>(null);

  const phase = holdToTalkPhase(0, false, available && held);
  const listening = phase === 'listening';

  const stop = (): void => {
    if (!available) return;
    const began = startedAt.current;
    startedAt.current = null;
    setHeld(false);
    const heldMs = began === null ? 0 : Date.now() - began;
    onRelease(heldMs, heldMs >= HOLD_TO_TALK_MIN_MS ? 'ready' : 'too_short');
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={() => {
          if (!available || busy) return;
          hapticTap();
          startedAt.current = Date.now();
          setHeld(true);
        }}
        onPressOut={stop}
        disabled={!available || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !available || busy }}
        accessibilityLabel={available ? 'Hold to talk' : 'Voice input unavailable'}
        style={[
          styles.dial,
          {
            borderColor: listening ? t.textPrimary : t.border,
            backgroundColor: listening ? t.surfaceMuted : t.surface,
          },
        ]}
      >
        <View
          style={[
            styles.core,
            { backgroundColor: listening ? t.textPrimary : t.textMuted },
          ]}
        />
        <Text allowFontScaling={false} style={[styles.label, { color: t.textPrimary }]}>
          {listening ? 'LISTENING' : available ? 'HOLD TO TALK' : 'VOICE OFF'}
        </Text>
      </Pressable>
      <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm },
  dial: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  core: { width: 10, height: 10, borderRadius: 5 },
  label: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  note: { ...typeScale.meta, fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 280 },
});
