import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HoodGameView } from '../../services/hoodGameService';
import { card, ink, layout, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';

export interface PredictionCardProps {
  game: HoodGameView;
  now?: number;
  busy?: boolean;
  onPick?: (optionId: string) => void;
  onOpen?: () => void;
  /** Compact PLAY shelf vs full detail. */
  compact?: boolean;
}

/**
 * Lightweight prediction card — clear options, no odds, no wagering language.
 * Percentages only render when the server includes them (post-close).
 */
export function PredictionCard({
  game,
  now = Date.now(),
  busy = false,
  onPick,
  onOpen,
  compact = false,
}: PredictionCardProps): React.JSX.Element {
  const closed = game.status === 'CLOSED' || game.status === 'RESOLVED' || game.closesAt <= now;
  const showPercents = game.options.some((o) => o.percent !== null);

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Prediction. ${game.question}`}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={styles.eyebrow}>PREDICTION</Text>
        {game.status === 'RESOLVED' ? (
          <Text allowFontScaling={false} style={styles.meta}>Resolved</Text>
        ) : closed ? (
          <Text allowFontScaling={false} style={styles.meta}>Closed</Text>
        ) : (
          <Text allowFontScaling={false} style={styles.meta}>
            Closes in {timeLeftLabel(game.closesAt, now).replace(' left', '')}
          </Text>
        )}
      </View>

      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={game.question}
      >
        <Text allowFontScaling={false} style={styles.question}>{game.question}</Text>
      </Pressable>

      <View style={styles.options}>
        {game.options.map((option) => {
          const selected = game.viewerOptionId === option.id;
          const winner = option.isWinner === true;
          const canPick = Boolean(onPick) && game.mayPredict && !busy;
          return (
            <Pressable
              key={option.id}
              disabled={!canPick}
              onPress={() => {
                if (!canPick || !onPick) return;
                hapticTap();
                onPick(option.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !canPick }}
              accessibilityLabel={option.label}
              style={[
                styles.option,
                selected && styles.optionSelected,
                winner && styles.optionWinner,
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.optionLabel, selected && styles.optionLabelOn]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
              {showPercents && option.percent !== null ? (
                <Text allowFontScaling={false} style={styles.percent}>{option.percent}%</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {game.hasPredicted && game.viewerOptionId ? (
        <Text allowFontScaling={false} style={styles.yours}>
          You picked {game.options.find((o) => o.id === game.viewerOptionId)?.label ?? 'an option'}
        </Text>
      ) : null}

      {game.totalParticipants !== null && !showPercents ? (
        <Text allowFontScaling={false} style={styles.meta}>
          {game.totalParticipants} {game.totalParticipants === 1 ? 'prediction' : 'predictions'}
        </Text>
      ) : null}

      {!compact && game.status === 'RESOLVED' ? (
        <View style={styles.result}>
          <Text allowFontScaling={false} style={styles.resultTitle}>
            {game.options.find((o) => o.isWinner)?.label ?? 'Result'} won
          </Text>
          {game.viewerCorrect !== null ? (
            <Text allowFontScaling={false} style={styles.meta}>
              {game.viewerCorrect ? 'You predicted correctly' : 'You predicted incorrectly'}
            </Text>
          ) : null}
          {game.correctPercent !== null && game.totalParticipants !== null ? (
            <Text allowFontScaling={false} style={styles.resultPct}>
              {game.correctPercent}% predicted correctly · {game.totalParticipants} participants
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 0.6 },
  meta: { ...typeScale.meta, color: ink.tertiary },
  question: { ...typeScale.cardTitle, color: ink.primary },
  options: { gap: space.xs },
  option: {
    minHeight: layout.hit,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  optionSelected: { borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.06)' },
  optionWinner: { borderColor: 'rgba(63,191,143,0.45)' },
  optionLabel: { ...typeScale.label, color: ink.primary, flex: 1, fontWeight: '600' },
  optionLabelOn: { color: ink.primary },
  percent: { ...typeScale.data, fontSize: 12, color: ink.secondary },
  yours: { ...typeScale.meta, color: ink.secondary },
  result: { gap: 4, paddingTop: space.xs, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  resultTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  resultPct: { ...typeScale.meta, color: ink.secondary },
});
