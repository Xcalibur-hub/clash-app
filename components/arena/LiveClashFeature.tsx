import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { tap as hapticTap } from '../../utils/haptics';
import { AppText } from '../shared/AppText';
import { phaseHeadline, type RoomPhase } from '../../utils/arenaHierarchy';

/**
 * The live clash, as the front door of Arena.
 *
 * ## The change
 *
 * Discovery used to lead with takes: a compact "live clashes" bar, then the takes
 * feed. That reads as a social feed that happens to have debates in it. CLASH is
 * the opposite — a live clash is the event, and takes are what people say about
 * it. The one screen that decides what the product *is* was leading with the
 * commentary instead of the event.
 *
 * This feature is the answer: when a clash is live it takes the top of the
 * screen, in the display voice, with the proposition at full editorial size, the
 * two sides as broadcast tags, and the phase stated as a sentence. When nothing
 * is live it does not render at all — a permanent "no live clashes" card would be
 * a daily reminder of absence.
 *
 * ## What it must not do
 *
 * It is a *doorway*, not a player. Every fact it shows comes from the room record
 * the caller already fetched; tapping it opens the real room through the existing
 * navigation. There is no optimistic state, no invented score and no pretence
 * that the clash is happening inside this card.
 */
export interface LiveClashFeatureProps {
  proposition: string;
  phase: RoomPhase;
  /** Stance words for the two sides, from the topic. */
  stanceA: string;
  stanceB: string;
  /** e.g. "12 arguing · 240 watching". */
  participation?: string;
  /** Countdown to the next phase change, already formatted. */
  clock?: string | null;
  onOpen: () => void;
  /** Optional second live clash, surfaced as a quiet secondary row. */
  moreCount?: number;
  onOpenMore?: () => void;
}

export function LiveClashFeature({
  proposition,
  phase,
  stanceA,
  stanceB,
  participation,
  clock,
  onOpen,
  moreCount,
  onOpenMore,
}: LiveClashFeatureProps): React.JSX.Element {
  const t = useThemeColors();
  const sides = arenaSidesForTheme(t);
  const live = phase === 'OPEN' || phase === 'FINAL_ARGUMENTS' || phase === 'JUDGING';

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.liveMark}>
          <View style={[styles.dot, { backgroundColor: live ? t.sideA : t.textMuted }]} accessibilityElementsHidden />
          <AppText style={[typeScale.kicker, { color: live ? t.sideA : t.textMuted }]}>
            {live ? 'LIVE NOW' : 'LATEST CLASH'}
          </AppText>
        </View>
        {clock ? (
          <AppText fixed style={[typeScale.meta, { color: t.textMuted }]}>
            {clock}
          </AppText>
        ) : null}
      </View>

      <Pressable
        onPress={() => {
          hapticTap();
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${phaseHeadline(phase, 'spectator')}. ${proposition}. Open the clash.`}
        style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
      >
        <AppText style={[typeScale.display, styles.proposition, { color: t.textPrimary }]}>
          {proposition}
        </AppText>

        <View style={styles.sides}>
          <SideChip label="A" stance={stanceA} color={sides.a.ink} soft={sides.a.soft} />
          <AppText style={[typeScale.meta, { color: t.textMuted }]}>vs</AppText>
          <SideChip label="B" stance={stanceB} color={sides.b.ink} soft={sides.b.soft} />
        </View>

        <View style={[styles.footer, { borderTopColor: t.divider }]}>
          <AppText style={[typeScale.meta, { color: t.textSecondary }]} numberOfLines={1}>
            {participation ?? phaseHeadline(phase, 'spectator')}
          </AppText>
          <AppText fixed style={[typeScale.label, { color: t.textPrimary }]}>
            Enter
          </AppText>
        </View>
      </Pressable>

      {moreCount && moreCount > 0 && onOpenMore ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onOpenMore();
          }}
          accessibilityRole="button"
          accessibilityLabel={`See ${moreCount} more live clashes`}
          style={styles.more}
        >
          <AppText style={[typeScale.meta, { color: t.textMuted }]}>
            {`${moreCount} more ${moreCount === 1 ? 'clash' : 'clashes'} live`}
          </AppText>
          <AppText fixed style={[typeScale.meta, { color: t.textPrimary }]}>
            {'→'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function SideChip({
  label,
  stance,
  color,
  soft,
}: {
  label: string;
  stance: string;
  color: string;
  soft: string;
}): React.JSX.Element {
  return (
    <View style={[styles.chip, { backgroundColor: soft, borderColor: color }]}>
      <AppText fixed style={[styles.chipLabel, { color }]}>
        {label}
      </AppText>
      <AppText style={[typeScale.caption, { color }]} numberOfLines={1}>
        {stance}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenX, paddingTop: space.md, gap: space.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveMark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  card: { gap: space.sm, paddingVertical: space.xs },
  proposition: { letterSpacing: -0.8 },
  sides: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xxs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '44%',
  },
  chipLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    marginTop: space.xxs,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    minHeight: 44,
  },
});
