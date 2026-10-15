/**
 * Accessible judgement controls — secondary to tapping Side cards.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { Side } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PressableScale } from '../../shared/PressableScale';

export interface ClashJudgeControlsProps {
  sideAHandle: string | null;
  sideBHandle: string | null;
  busy: boolean;
  pendingSide: Side | null;
  onJudge: (side: Side) => void;
}

export function ClashJudgeControls({
  sideAHandle,
  sideBHandle,
  busy,
  pendingSide,
  onJudge,
}: ClashJudgeControlsProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        CAST YOUR VOTE
      </Text>
      <View style={styles.row}>
        <JudgeButton
          side="A"
          handle={sideAHandle}
          busy={busy}
          pending={pendingSide === 'A'}
          onPress={() => onJudge('A')}
        />
        <JudgeButton
          side="B"
          handle={sideBHandle}
          busy={busy}
          pending={pendingSide === 'B'}
          onPress={() => onJudge('B')}
        />
      </View>
    </View>
  );
}

function JudgeButton({
  side,
  handle,
  busy,
  pending,
  onPress,
}: {
  side: Side;
  handle: string | null;
  busy: boolean;
  pending: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const dark = t.scheme === 'dark';
  const tone = dark ? '#211B29' : '#261E2A';
  const soft = side === 'A'
    ? (dark ? '#C6ACEB' : '#E4D1FF')
    : (dark ? '#F4A88F' : '#FFC3A9');
  const selectedFill = side === 'A' ? '#B492E4' : '#F09277';
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={handle ? `Judge Side ${side}, ${handle}` : `Judge Side ${side}`}
      accessibilityState={{ busy: pending }}
      style={[
        styles.btn,
        {
          borderColor: pending ? tone : 'transparent',
          backgroundColor: pending ? selectedFill : soft,
          opacity: busy && !pending ? 0.45 : 1,
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.btnLabel, { color: tone }]}>
        {pending ? 'LOCKING…' : `VOTE SIDE ${side} ↗`}
      </Text>
      <Text allowFontScaling={false} style={[styles.btnHandle, { color: t.textMuted }]} numberOfLines={1}>
        {handle ? `@${handle}` : `VOTE SIDE ${side}`}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  kicker: {
    ...typeScale.caption,
    letterSpacing: 1.6,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: { flexDirection: 'row', gap: space.sm },
  btn: {
    flex: 1,
    minHeight: 88,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  btnLabel: { ...typeScale.label, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }), fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  btnHandle: { ...typeScale.meta, fontSize: 12 },
});
