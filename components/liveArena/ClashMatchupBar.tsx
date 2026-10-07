/**
 * Side A vs Side B matchup — broadcast identity without leaking live tallies.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export interface ClashMatchupBarProps {
  duel?: ArenaDuel;
  onOpenProfile?: (id: string) => void;
  fighterAName?: string;
  fighterBName?: string;
  /** Optional settled split 0–1 for Agree share. Omit while live (privacy). */
  agreeShare?: number | null;
  /** Compact for cards; room/stage for headers. */
  size?: 'card' | 'room' | 'stage';
  /** Live story beat under the matchup. */
  storyBeat?: string | null;
  /** Soft emphasis on latest speaker — presentation only, never a score. */
  highlightSide?: 'A' | 'B' | null;
}

function DuelMatchup({
  duel,
  onOpenProfile,
  stage = false,
  highlightSide = null,
}: {
  duel: ArenaDuel;
  onOpenProfile?: (id: string) => void;
  stage?: boolean;
  highlightSide?: 'A' | 'B' | null;
}): React.JSX.Element {
  const t = useThemeColors();
  const avatarSize = stage ? 56 : 36;
  const sides = [
    { side: 'A' as const, fighter: duel.fighterA, position: duel.sourceText },
    { side: 'B' as const, fighter: duel.fighterB, position: duel.counterPosition },
  ];

  return (
    <View style={styles.duelWrap}>
      <View style={styles.duelRow}>
        {sides.map(({ side, fighter, position }, index) => {
          const emphasized = highlightSide === side;
          return (
          <React.Fragment key={side}>
            {index === 1 ? (
              <Text
                allowFontScaling={false}
                style={[styles.duelVs, stage && styles.duelVsStage, { color: t.textMuted }]}
                accessibilityLabel="versus"
              >
                VS
              </Text>
            ) : null}
            <View style={[styles.duelCol, emphasized && { opacity: 1 }, highlightSide && !emphasized && { opacity: 0.72 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open Fighter ${side}, ${fighter.name}'s profile`}
                disabled={!onOpenProfile}
                onPress={() => onOpenProfile?.(fighter.id)}
                style={styles.fighterHit}
              >
                <Avatar name={fighter.name} tint={fighter.tint ?? t.textMuted} size={avatarSize} />
                <Text
                  allowFontScaling
                  numberOfLines={1}
                  style={[styles.duelName, stage && styles.duelNameStage, { color: t.textPrimary }]}
                >
                  {fighter.name}
                </Text>
                <Text
                  allowFontScaling
                  numberOfLines={1}
                  style={[styles.duelHandle, { color: t.textMuted }]}
                >
                  @{fighter.handle}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.duelSideLabel, { color: t.textMuted }]}
                >
                  Fighter {side}
                </Text>
              </Pressable>
              <Text
                selectable
                style={[styles.duelPosition, stage && styles.duelPositionStage, { color: t.textSecondary }]}
                numberOfLines={stage ? 4 : 3}
              >
                {position?.trim()
                  ? `“${position.trim()}”`
                  : side === 'A'
                    ? 'Source Take'
                    : 'Counter-position not provided'}
              </Text>
            </View>
          </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export function ClashMatchupBar({
  agreeShare = null,
  size = 'card',
  storyBeat = null,
  fighterAName,
  fighterBName,
  duel,
  onOpenProfile,
  highlightSide = null,
}: ClashMatchupBarProps): React.JSX.Element {
  const t = useThemeColors();
  const { a, b } = arenaSidesForTheme(t);
  const room = size === 'room' || size === 'stage';
  const showSplit = agreeShare != null && Number.isFinite(agreeShare);

  if (duel) {
    return (
      <DuelMatchup
        duel={duel}
        onOpenProfile={onOpenProfile}
        stage={size === 'stage'}
        highlightSide={highlightSide}
      />
    );
  }

  return (
    <View style={[styles.wrap, room && styles.wrapRoom]}>
      <View style={styles.row}>
        <View style={[styles.side, { backgroundColor: a.soft, borderColor: a.ink }]}>
          <Text allowFontScaling={false} style={[styles.sideKey, { color: a.ink }]}>
            {fighterAName ? 'FIGHTER A' : a.label}
          </Text>
          <Text allowFontScaling={false} style={[styles.sideName, { color: t.textPrimary }]}>
            {fighterAName ?? a.stanceLabel}
          </Text>
          {showSplit ? (
            <Text allowFontScaling={false} style={[styles.pct, { color: a.ink }]}>
              {Math.round(agreeShare! * 100)}%
            </Text>
          ) : null}
        </View>
        <Text allowFontScaling={false} style={[styles.vs, { color: t.textMuted }]}>
          VS
        </Text>
        <View style={[styles.side, { backgroundColor: b.soft, borderColor: b.ink }]}>
          <Text allowFontScaling={false} style={[styles.sideKey, { color: b.ink }]}>
            {fighterBName ? 'FIGHTER B' : b.label}
          </Text>
          <Text allowFontScaling={false} style={[styles.sideName, { color: t.textPrimary }]}>
            {fighterBName ?? b.stanceLabel}
          </Text>
          {showSplit ? (
            <Text allowFontScaling={false} style={[styles.pct, { color: b.ink }]}>
              {Math.round((1 - agreeShare!) * 100)}%
            </Text>
          ) : null}
        </View>
      </View>
      {showSplit ? (
        <View style={[styles.bar, { backgroundColor: t.surfaceMuted }]}>
          <View
            style={[
              styles.fill,
              { flex: Math.max(agreeShare!, 0.04), backgroundColor: a.ink },
            ]}
          />
          <View
            style={[
              styles.fill,
              { flex: Math.max(1 - agreeShare!, 0.04), backgroundColor: b.ink },
            ]}
          />
        </View>
      ) : (
        <View style={[styles.liveRail, { backgroundColor: t.border }]}>
          <View style={[styles.liveDot, { backgroundColor: a.ink }]} />
          <View style={[styles.liveMid, { backgroundColor: t.textMuted }]} />
          <View style={[styles.liveDot, { backgroundColor: b.ink }]} />
        </View>
      )}
      {storyBeat ? (
        <Text allowFontScaling={false} style={[styles.beat, { color: t.textSecondary }]} numberOfLines={2}>
          {storyBeat}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  duelWrap: { gap: space.sm },
  duelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  duelCol: {
    flex: 1,
    minWidth: 0,
    gap: space.sm,
  },
  fighterHit: {
    minHeight: 44,
    alignItems: 'center',
    gap: 4,
  },
  duelName: {
    ...typeScale.label,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  duelNameStage: { fontSize: 17 },
  duelHandle: {
    ...typeScale.caption,
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
  },
  duelSideLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  duelPosition: {
    ...typeScale.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  duelPositionStage: { fontSize: 14, lineHeight: 20 },
  duelVs: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    alignSelf: 'center',
    paddingHorizontal: 2,
    marginTop: 28,
  },
  duelVsStage: { marginTop: 40, fontSize: 13 },
  wrap: { gap: 8 },
  wrapRoom: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  sideKey: {
    ...typeScale.caption,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  sideName: {
    ...typeScale.label,
    fontSize: 14,
    fontWeight: '800',
  },
  pct: {
    ...typeScale.data,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  vs: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bar: {
    height: 4,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  liveRail: {
    height: 3,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveMid: { flex: 1, height: 1, marginHorizontal: 6, opacity: 0.35 },
  beat: {
    ...typeScale.meta,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
