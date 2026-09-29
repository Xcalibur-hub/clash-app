import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { VerifiedIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { sideTone } from './duelPalette';

export interface JudgementPanelProps {
  sideAHandle: string | null;
  sideBHandle: string | null;
  busy: boolean;
  onJudge: (side: Side) => void;
}

/** The open-clash ballot: a balanced, clearly worded choice between A and B. */
export function JudgementPanel({ sideAHandle, sideBHandle, busy, onJudge }: JudgementPanelProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.prompt}>
        Which argument made the stronger case?
      </Text>
      <View style={styles.row}>
        <JudgeButton side="A" handle={sideAHandle} onPress={() => onJudge('A')} busy={busy} />
        <JudgeButton side="B" handle={sideBHandle} onPress={() => onJudge('B')} busy={busy} />
      </View>
    </View>
  );
}

function JudgeButton({
  side,
  handle,
  onPress,
  busy,
}: {
  side: Side;
  handle: string | null;
  onPress: () => void;
  busy: boolean;
}): React.JSX.Element {
  const { tone, soft } = sideTone(side);
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={handle ? `Vote for Side ${side}, ${handle}` : `Vote for Side ${side}`}
      style={[styles.btn, { borderColor: tone, backgroundColor: soft }, busy && styles.busy]}
    >
      <Text allowFontScaling={false} style={[styles.btnLabel, { color: tone }]}>
        JUDGE {side}
      </Text>
      {handle ? (
        <Text allowFontScaling={false} style={styles.btnHandle} numberOfLines={1}>
          @{handle}
        </Text>
      ) : (
        <Text allowFontScaling={false} style={styles.btnHandle} numberOfLines={1}>
          Side {side}
        </Text>
      )}
    </PressableScale>
  );
}

/** The locked-ballot state: calm, states the viewer's choice, reveals nothing else. */
export function LockedJudgement({ side }: { side: Side }): React.JSX.Element {
  const { tone } = sideTone(side);
  return (
    <View style={[styles.locked, { borderColor: tone }]}>
      <VerifiedIcon size={18} color={tone} strokeWidth={2.4} />
      <Text allowFontScaling={false} style={styles.lockedTitle}>
        Judgement locked
      </Text>
      <Text allowFontScaling={false} style={styles.lockedBody}>
        You backed Side {side}. The result is revealed when judging closes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  prompt: { ...typeScale.body, color: ink.secondary, fontWeight: '500' },
  row: { flexDirection: 'row', gap: space.sm },
  btn: {
    flex: 1,
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  busy: { opacity: 0.5 },
  btnLabel: { ...typeScale.label, fontWeight: '800', letterSpacing: 0.4 },
  btnHandle: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
  locked: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  lockedTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  lockedBody: { ...typeScale.meta, color: ink.tertiary },
});
