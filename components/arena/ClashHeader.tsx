import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { AppText } from '../shared/AppText';
import { BackIcon } from '../shared/icons';
import {
  phaseHeadline,
  phaseProgress,
  type RoomPhase,
  type ViewerRole,
} from '../../utils/arenaHierarchy';

/**
 * The canonical Arena clash header.
 *
 * ## Why this replaces the old room header
 *
 * The previous header was a back button, a two-line uppercase title and a
 * `LIVE · Room 3 · 12 fighters · 40 spectators joined · 04:31` run-on line. That
 * line carried five facts at identical weight, so it answered none of them: the
 * phase (the thing that changes what you may do) was the least prominent item,
 * and on a narrow screen with large text it wrapped into a grey paragraph.
 *
 * This header states one thing loudly and the rest quietly, in reading order:
 *
 *   1. **phase**     — a written headline, not a dot: "THE FLOOR IS OPEN"
 *   2. **subject**   — the proposition, in the editorial serif voice
 *   3. **sides**     — Side A / Side B with the stance word, so a newcomer learns
 *                      the room's vocabulary before meeting it in the transcript
 *   4. **ambient**   — room, audience, clock, folded into one subordinate line
 *   5. **progress**  — a single hairline that advances with the phase
 *
 * Everything that can wrap does wrap; nothing is `numberOfLines`-clipped except
 * the ambient line, which is metadata rather than content.
 */
export interface ClashHeaderProps {
  proposition: string;
  phase: RoomPhase;
  role: ViewerRole;
  /** Side A's stance word for this topic (e.g. "Agree"). */
  stanceA?: string;
  stanceB?: string;
  /** e.g. "Room 3". Omitted when the room has no index. */
  roomLabel?: string;
  /** e.g. "12 fighters · 40 here". */
  audienceLine?: string;
  /** Countdown or clock, already formatted. */
  clock?: string | null;
  onBack: () => void;
  /** Rendered on the right of the top row — a follow or share affordance. */
  accessory?: React.ReactNode;
}

export function ClashHeader({
  proposition,
  phase,
  role,
  stanceA,
  stanceB,
  roomLabel,
  audienceLine,
  clock,
  onBack,
  accessory,
}: ClashHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const sides = arenaSidesForTheme(t);
  const headline = phaseHeadline(phase, role);
  const progress = phaseProgress(phase);
  const settled = phase === 'SETTLED' || phase === 'CANCELLED';

  const ambient = [roomLabel, audienceLine, clock ?? undefined].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to Arena"
          style={styles.back}
        >
          <BackIcon size={20} color={t.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.topSpacer} />
        {accessory}
      </View>

      {/*
        The phase eyebrow. Colour comes from the phase, not from decoration: the
        settled phase is the only one painted in brand ink, because that is the
        one moment the screen is telling you something happened.
      */}
      <View style={styles.eyebrowRow}>
        {!settled ? (
          <View style={[styles.liveDot, { backgroundColor: t.sideA }]} accessibilityElementsHidden />
        ) : null}
        <AppText
          style={[typeScale.kicker, { color: settled ? t.brand : t.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {headline}
        </AppText>
      </View>

      {/* The subject — the reason the screen exists, in the display voice. */}
      <AppText style={[typeScale.editorial, styles.proposition, { color: t.textPrimary }]}>
        {proposition}
      </AppText>

      {/* The two sides, so the vocabulary is visible before the argument uses it. */}
      <View style={styles.sides}>
        <SideTag label={sides.a.label} stance={stanceA ?? sides.a.stanceLabel} color={sides.a.ink} soft={sides.a.soft} />
        <SideTag label={sides.b.label} stance={stanceB ?? sides.b.stanceLabel} color={sides.b.ink} soft={sides.b.soft} />
      </View>

      {ambient ? (
        <AppText style={[typeScale.meta, { color: t.textMuted }]} numberOfLines={1}>
          {ambient}
        </AppText>
      ) : null}

      {/* One hairline of progress. No numbered stepper: the phases are names, not
          a checklist the user is meant to tick off. */}
      <View style={[styles.rail, { backgroundColor: t.divider }]} accessibilityElementsHidden>
        <View
          style={[
            styles.railFill,
            { backgroundColor: settled ? t.brand : t.textPrimary, width: `${progress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

function SideTag({
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
    <View style={[styles.sideTag, { backgroundColor: soft, borderColor: color }]}>
      <AppText fixed style={[styles.sideKey, { color }]}>
        {label.replace('SIDE ', '')}
      </AppText>
      <AppText style={[typeScale.caption, { color }]} numberOfLines={1}>
        {stance}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.md,
    gap: space.xs,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  back: {
    // 44 minimum, and the negative margin keeps the glyph optically aligned with
    // the screen edge rather than the touch box.
    width: 44,
    height: 44,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSpacer: { flex: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  proposition: {
    // The serif at 24/30 with tight tracking reads as a headline without
    // shouting; `displayLg` would fight the verdict when one appears.
    marginTop: 2,
  },
  sides: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs, marginTop: space.xxs },
  sideTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sideKey: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  rail: { height: 2, borderRadius: 1, marginTop: space.sm, overflow: 'hidden' },
  railFill: { height: 2, borderRadius: 1 },
});
