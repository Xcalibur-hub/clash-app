import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveInteractionState } from '../../../utils/creatorLiveEvents';
import {
  hasReachedThreshold,
  interactionPromptVerb,
  interactionTypeLabel,
  liveActionLabel,
  optionShare,
  tallyFor,
  thresholdProgress,
  thresholdRemaining,
} from '../../../utils/creatorLiveState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { VaultActionButton } from '../VaultActionButton';

export interface LiveInteractionPanelProps {
  interaction: LiveInteractionState;
  busy: boolean;
  onVote: (optionId: string | null) => void;
  /** Shown instead of "Watching only" when the viewer cannot take part yet. */
  blockedNote?: string;
}

function secondsLeft(closesAt: number | null, now: number): number | null {
  if (closesAt == null) return null;
  return Math.max(0, Math.round((closesAt - now) / 1000));
}

/** Options tally into server bars; a crowd action tallies into one meter. */
export function LiveInteractionPanel({
  interaction,
  busy,
  onVote,
  blockedNote,
}: LiveInteractionPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const left = secondsLeft(interaction.closesAt, Date.now());
  const participable = interaction.canParticipate && !busy;
  const reveal = interaction.voted || interaction.status !== 'OPEN';
  const crowd = interaction.type === 'CROWD_ACTION';

  return (
    <View style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          {interactionTypeLabel(interaction.type).toUpperCase()}
        </Text>
        {left != null && interaction.status === 'OPEN' ? (
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            {left}s
          </Text>
        ) : null}
      </View>

      <Text allowFontScaling={false} style={[styles.prompt, { color: t.textPrimary }]}>
        {interaction.prompt}
      </Text>

      {crowd ? (
        <View style={styles.crowd}>
          <View style={[styles.meter, { backgroundColor: t.surfaceMuted }]}>
            <View
              style={[
                styles.meterFill,
                {
                  width: `${Math.round(thresholdProgress(interaction.totalVotes, interaction.threshold) * 100)}%`,
                  backgroundColor: interaction.status === 'TRIGGERED' ? '#E5484D' : t.textPrimary,
                },
              ]}
            />
          </View>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
            {interaction.status === 'TRIGGERED'
              ? `${liveActionLabel(interaction.actionKind ?? 'HOLD_FRAME')} — triggered by the crowd`
              : `${interaction.totalVotes} / ${interaction.threshold ?? 0} · ${thresholdRemaining(
                  interaction.totalVotes,
                  interaction.threshold,
                )} to go`}
          </Text>
          {interaction.status === 'OPEN' ? (
            <VaultActionButton
              label={
                busy
                  ? 'Supporting…'
                  : interaction.voted
                    ? 'Supported'
                    : interactionPromptVerb(interaction.type).toUpperCase()
              }
              tone={interaction.voted ? 'quiet' : 'solid'}
              compact
              onPress={() => {
                if (!participable) return;
                hapticTap();
                onVote(null);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {!crowd ? (
        <View style={styles.options}>
          {(interaction.options ?? []).map((option) => {
            const count = tallyFor(interaction.tallies, option.id);
            const share = optionShare(interaction.tallies, option.id);
            const mine = interaction.myVote === option.id;
            const winner =
              interaction.result !== null &&
              typeof interaction.result.winner === 'string' &&
              interaction.result.winner === option.id;
            return (
              <Pressable
                key={option.id}
                disabled={!participable || interaction.voted}
                onPress={() => {
                  hapticTap();
                  onVote(option.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                style={[
                  styles.option,
                  {
                    borderColor: mine || winner ? t.textPrimary : t.border,
                    backgroundColor: t.surface,
                  },
                ]}
              >
                {reveal ? (
                  <View
                    style={[
                      styles.optionFill,
                      { width: `${Math.round(share * 100)}%`, backgroundColor: t.surfaceMuted },
                    ]}
                  />
                ) : null}
                <View style={styles.optionRow}>
                  <Text allowFontScaling={false} style={[styles.optionLabel, { color: t.textPrimary }]}>
                    {option.label}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.optionCount, { color: t.textMuted }]}>
                    {reveal ? `${Math.round(share * 100)}%` : mine ? 'YOUR VOTE' : ''}
                  </Text>
                </View>
                {reveal ? (
                  <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
                    {count} {count === 1 ? 'vote' : 'votes'}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!interaction.canParticipate && interaction.status === 'OPEN' ? (
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {hasReachedThreshold(interaction.totalVotes, interaction.threshold)
            ? 'Threshold reached'
            : (blockedNote ?? 'Watching only')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  prompt: { ...typeScale.section, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  crowd: { gap: space.sm, marginTop: space.xs },
  meter: { height: 10, borderRadius: 999, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999 },
  meta: { ...typeScale.meta },
  options: { gap: space.sm, marginTop: space.xs },
  option: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  optionFill: { ...StyleSheet.absoluteFillObject },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  optionLabel: { ...typeScale.body, fontSize: 16, fontWeight: '700' },
  optionCount: { ...typeScale.caption, fontWeight: '800' },
});

