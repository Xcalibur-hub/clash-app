/**
 * The Stage — calm upper zone of a live Clash.
 * LIVE + proposition + two speakers + current args + Back (not judgement).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { LivePulse } from './LivePulse';
import { ClashSpeaker } from './ClashSpeaker';

export interface ClashStageProps {
  duel: ArenaDuel;
  proposition: string;
  live: boolean;
  statusLabel: string;
  spectatorCount: number | null;
  argumentA: ArenaMessage | null;
  argumentB: ArenaMessage | null;
  condensed?: boolean;
  backingSide: 'A' | 'B' | null;
  onBackSide: (side: 'A' | 'B') => void;
  canBack: boolean;
  onOpenProfile?: (id: string) => void;
  onViewHistory: () => void;
  onMore: () => void;
  roleLabel?: string;
}

export function ClashStage({
  duel,
  proposition,
  live,
  statusLabel,
  spectatorCount,
  argumentA,
  argumentB,
  condensed = false,
  backingSide,
  onBackSide,
  canBack,
  onOpenProfile,
  onViewHistory,
  onMore,
  roleLabel,
}: ClashStageProps): React.JSX.Element {
  const t = useThemeColors();
  const [fighterA, fighterB] = duelActiveSpeakers(duel);

  return (
    <View
      style={[styles.wrap, condensed && styles.wrapCondensed]}
      accessibilityLabel="Clash stage"
    >
      <View style={styles.topRow}>
        <View
          style={styles.statusCluster}
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            spectatorCount !== null
              ? `${statusLabel}. ${spectatorCount} watching`
              : statusLabel
          }
        >
          {live ? <LivePulse dotOnly size={6} /> : null}
          <Text style={[styles.status, { color: live ? t.textPrimary : t.textSecondary }]}>
            {statusLabel}
          </Text>
          {spectatorCount !== null ? (
            <>
              <Text style={[styles.sep, { color: t.textMuted }]}>·</Text>
              <Text style={[styles.watching, { color: t.textMuted }]}>
                {spectatorCount} watching
              </Text>
            </>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More Clash options"
          onPress={onMore}
          style={styles.moreHit}
        >
          <Text style={[styles.more, { color: t.textMuted }]}>•••</Text>
        </Pressable>
      </View>

      <Text
        accessibilityRole="header"
        selectable
        numberOfLines={condensed ? 2 : 4}
        style={[
          styles.proposition,
          condensed && styles.propositionCondensed,
          { color: t.textPrimary },
        ]}
      >
        {proposition}
      </Text>

      {roleLabel ? (
        <Text style={[styles.role, { color: t.textMuted }]}>{roleLabel}</Text>
      ) : null}

      <View style={[styles.speakers, condensed && styles.speakersCondensed]}>
        <ClashSpeaker
          fighter={fighterA}
          side="A"
          argument={argumentA}
          condensed={condensed}
          active={backingSide === 'A'}
          onOpenProfile={onOpenProfile}
        />
        {!condensed ? (
          <Text
            allowFontScaling={false}
            style={[styles.vs, { color: t.textMuted }]}
            accessibilityLabel="versus"
          >
            VS
          </Text>
        ) : null}
        <ClashSpeaker
          fighter={fighterB}
          side="B"
          argument={argumentB}
          condensed={condensed}
          active={backingSide === 'B'}
          onOpenProfile={onOpenProfile}
        />
      </View>

      {!condensed && canBack ? (
        <View style={styles.backRow}>
          {([
            { side: 'A' as const, name: fighterA.name },
            { side: 'B' as const, name: fighterB.name },
          ]).map(({ side, name }) => {
            const on = backingSide === side;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  on
                    ? `Backing ${name}. Support during the Clash — not a judgement.`
                    : `Back ${name}. Support during the Clash — not a judgement.`
                }
                onPress={() => {
                  hapticTap();
                  onBackSide(side);
                }}
                style={[
                  styles.backBtn,
                  {
                    borderColor: on ? t.textPrimary : t.borderStrong,
                    backgroundColor: on ? t.textPrimary : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.backLabel,
                    { color: on ? t.background : t.textPrimary },
                  ]}
                >
                  {on ? `BACKING ${name.toUpperCase()}` : `BACK ${name.toUpperCase()}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!condensed && canBack ? (
        <Text style={[styles.backHint, { color: t.textMuted }]}>
          Backing supports a side during the Clash. It is not your judgement vote.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View argument history"
        onPress={onViewHistory}
        style={styles.historyHit}
      >
        <Text style={[styles.history, { color: t.textMuted }]}>View argument history</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xs,
    gap: space.sm,
  },
  wrapCondensed: { flex: 0.38, gap: space.xs },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  statusCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  status: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sep: { fontSize: 12 },
  watching: { ...typeScale.caption, fontSize: 12, fontWeight: '500' },
  moreHit: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  more: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  proposition: {
    ...typeScale.title,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  propositionCondensed: { fontSize: 16, lineHeight: 21 },
  role: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  speakers: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    flex: 1,
    minHeight: 0,
  },
  speakersCondensed: { flex: 0, alignItems: 'center' },
  vs: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    alignSelf: 'center',
    paddingTop: 28,
  },
  backRow: { flexDirection: 'row', gap: space.sm },
  backBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  backLabel: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  backHint: {
    ...typeScale.caption,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  historyHit: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  history: { ...typeScale.caption, fontSize: 13, fontWeight: '600' },
});
