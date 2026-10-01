/**
 * Accessible judgement controls — secondary to tapping Side cards.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PressableScale } from '../../shared/PressableScale';
import { useDuelSurface } from './clashTheme';

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
        Judge this Clash
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
  const { tone, soft, selectedFill } = useDuelSurface(side);
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
          borderColor: tone,
          backgroundColor: pending ? selectedFill : soft,
          opacity: busy && !pending ? 0.45 : 1,
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.btnLabel, { color: tone }]}>
        {pending ? 'Submitting…' : `Side ${side}`}
      </Text>
      <Text allowFontScaling={false} style={[styles.btnHandle, { color: t.textMuted }]} numberOfLines={1}>
        {handle ? `@${handle}` : `Side ${side}`}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  kicker: {
    ...typeScale.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  row: { flexDirection: 'row', gap: space.sm },
  btn: {
    flex: 1,
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  btnLabel: { ...typeScale.label, fontWeight: '700', letterSpacing: 0.2 },
  btnHandle: { ...typeScale.meta, fontSize: 12 },
});
