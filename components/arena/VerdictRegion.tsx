import React from 'react';
import { StyleSheet, View } from 'react-native';
import { layout, radius, rhythm, space, typeScale, useThemeColors } from '../../theme';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { AppText } from '../shared/AppText';
import { typeScale as ramp } from '../../theme';

/**
 * The verdict — the one screen in Arena that is allowed to be large.
 *
 * ## What was wrong before
 *
 * The result arrived as a banner inside the transcript list, at the same weight as
 * an "arguments closed" notice. A user who scrolled the floor during JUDGING saw
 * the outcome appear somewhere above them and had to infer it from a percentage.
 * The most important moment in the product looked like a system message.
 *
 * ## The shape
 *
 * Three statements, in the order people actually ask them:
 *
 *   1. **who won**    — the winning side's own colour and its stance word
 *   2. **by how much** — the split, as a single bar, because a 54/46 and a 90/10
 *                        are different stories and a bare percentage hides that
 *   3. **what it means** — rewards, and what the viewer personally gets
 *
 * A DRAW is a first-class outcome, not a missing winner: it gets its own neutral
 * treatment rather than rendering as "side A with 50%".
 */
export interface VerdictRegionProps {
  /** AGREE / DISAGREE / DRAW, straight from the room record. */
  winningSide: 'AGREE' | 'DISAGREE' | 'DRAW';
  /** Share of the ballot for side A, 0–1. Null when the room was cancelled. */
  splitA: number | null;
  stanceA: string;
  stanceB: string;
  /** One line of context — the tally, the quorum, the reason for a void. */
  detail?: string;
  /** Rewards or winnings, already formatted by the caller. */
  rewardLine?: string | null;
  /** Rendered under the split — replay / next clash affordances. */
  children?: React.ReactNode;
}

export function VerdictRegion({
  winningSide,
  splitA,
  stanceA,
  stanceB,
  detail,
  rewardLine,
  children,
}: VerdictRegionProps): React.JSX.Element {
  const t = useThemeColors();
  const sides = arenaSidesForTheme(t);

  const isDraw = winningSide === 'DRAW';
  const winner = isDraw ? null : winningSide === 'AGREE' ? sides.a : sides.b;
  const winnerStance = winningSide === 'AGREE' ? stanceA : stanceB;
  const ink = winner?.ink ?? t.textPrimary;

  // A draw is neutral; a decided room is painted in the winner's own colour so
  // the result is recognisable before the word is read.
  const shareA = splitA == null ? 0.5 : Math.min(1, Math.max(0, splitA));

  return (
    <View style={styles.wrap}>
      <View style={[styles.rule, { backgroundColor: ink }]} accessibilityElementsHidden />

      <AppText style={[ramp.kicker, { color: t.textMuted }]}>
        {isDraw ? 'THE ROOM SPLIT' : `SIDE ${winner?.key ?? ''} TAKES IT`}
      </AppText>

      <AppText style={[ramp.displayLg, styles.headline, { color: ink }]}>
        {isDraw ? 'A draw' : winnerStance}
      </AppText>

      {splitA != null ? (
        <View
          style={styles.split}
          accessibilityRole="text"
          accessibilityLabel={`Ballot split: ${Math.round(shareA * 100)} percent ${stanceA}, ${Math.round(
            (1 - shareA) * 100,
          )} percent ${stanceB}`}
        >
          <View style={styles.splitBar}>
            <View
              style={{
                flex: shareA,
                backgroundColor: sides.a.ink,
                borderTopLeftRadius: 3,
                borderBottomLeftRadius: 3,
              }}
            />
            <View
              style={{
                flex: 1 - shareA,
                backgroundColor: sides.b.ink,
                borderTopRightRadius: 3,
                borderBottomRightRadius: 3,
              }}
            />
          </View>
          <View style={styles.splitLegend}>
            <AppText style={[typeScale.meta, { color: sides.a.ink }]}>
              {`${Math.round(shareA * 100)}% ${stanceA}`}
            </AppText>
            <AppText style={[typeScale.meta, { color: sides.b.ink }]}>
              {`${Math.round((1 - shareA) * 100)}% ${stanceB}`}
            </AppText>
          </View>
        </View>
      ) : null}

      {detail ? (
        <AppText style={[typeScale.body, { color: t.textSecondary }]}>{detail}</AppText>
      ) : null}

      {rewardLine ? (
        <View style={[styles.reward, { backgroundColor: t.goldSoft, borderColor: t.gold }]}>
          <AppText style={[typeScale.label, { color: t.gold }]}>{rewardLine}</AppText>
        </View>
      ) : null}

      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.xs,
  },
  rule: { width: 32, height: 3, borderRadius: 2, marginBottom: rhythm.headingGap },
  headline: { marginTop: 2 },
  split: { gap: space.xxs, marginTop: space.sm },
  splitBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  splitLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  reward: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  actions: { marginTop: space.md, gap: space.xs },
});
