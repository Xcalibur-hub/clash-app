import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Stance } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { StanceChoiceRow } from '../arena/StanceChoiceRow';
import { LivePulse } from './LivePulse';
import { secondsLabel, softFill } from './liveArenaStyles';

export interface ArenaStanceGateProps {
  title: string;
  description?: string | null;
  /** Server remainder in whole seconds — the client never computes the clock. */
  secondsRemaining?: number;
  participantCount?: number;
  busy?: boolean;
  onChoose: (stance: Stance) => void;
}

/**
 * The door into a room: answer before you read anyone else's argument.
 *
 * There is intentionally no aggregate here. The split is not shown before the
 * choice (that would anchor the answer), and it is never shown after it either —
 * a stance is private for the lifetime of the topic.
 */
export function ArenaStanceGate({
  title,
  description,
  secondsRemaining,
  participantCount,
  busy = false,
  onChoose,
}: ArenaStanceGateProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <LivePulse />
        {typeof secondsRemaining === 'number' ? (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {secondsLabel(secondsRemaining)} left
          </Text>
        ) : null}
      </View>

      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {title}
      </Text>

      {description ? (
        <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]}>
          {description}
        </Text>
      ) : null}

      <View style={[styles.panel, { backgroundColor: softFill(t), borderColor: t.border }]}>
        <StanceChoiceRow prompt="What do you believe?" disabled={busy} onChoose={onChoose} />
        <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
          Your stance stays private. Nobody in the room ever sees how you answered.
        </Text>
      </View>

      {typeof participantCount === 'number' && participantCount > 0 ? (
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {participantCount} already arguing
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    ...typeScale.editorial,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    marginTop: space.xs,
  },
  description: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  panel: {
    marginTop: space.sm,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: { ...typeScale.caption, fontSize: 11, lineHeight: 16 },
  meta: { ...typeScale.meta, fontSize: 13 },
});
