/**
 * Side A vs Side B matchup — broadcast identity without leaking live tallies.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export interface ClashMatchupBarProps {
  /** Optional settled split 0–1 for Agree share. Omit while live (privacy). */
  agreeShare?: number | null;
  /** Compact for cards; room for headers. */
  size?: 'card' | 'room';
  /** Live story beat under the matchup. */
  storyBeat?: string | null;
}

export function ClashMatchupBar({
  agreeShare = null,
  size = 'card',
  storyBeat = null,
}: ClashMatchupBarProps): React.JSX.Element {
  const t = useThemeColors();
  const { a, b } = arenaSidesForTheme(t);
  const room = size === 'room';
  const showSplit = agreeShare != null && Number.isFinite(agreeShare);

  return (
    <View style={[styles.wrap, room && styles.wrapRoom]}>
      <View style={styles.row}>
        <View style={[styles.side, { backgroundColor: a.soft, borderColor: a.ink }]}>
          <Text allowFontScaling={false} style={[styles.sideKey, { color: a.ink }]}>
            {a.label}
          </Text>
          <Text allowFontScaling={false} style={[styles.sideName, { color: t.textPrimary }]}>
            {a.stanceLabel}
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
            {b.label}
          </Text>
          <Text allowFontScaling={false} style={[styles.sideName, { color: t.textPrimary }]}>
            {b.stanceLabel}
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
