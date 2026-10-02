import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic, Stance } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { plural } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { LivePulse } from './LivePulse';
import { phaseLabel, secondsLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export interface DailyArenaCardProps {
  topic: LiveArenaTopic;
  /** Opens the topic (and the stance gate when the viewer has not joined). */
  onOpen: () => void;
  /** Commits a stance straight from the feed, skipping the gate. */
  onChoose: (stance: Stance) => void;
  /** Already a member: go to the room. */
  onEnter: () => void;
}

/**
 * The Arena home entry point for today's Topic.
 *
 * Shows the real participant total and the server's own countdown — nothing is
 * rounded up or decorated. Deliberately does NOT show how the room is split: a
 * stance is private, and seeing the majority before choosing is the bandwagon
 * the whole feature is designed to avoid.
 */
export function DailyArenaCard({
  topic,
  onOpen,
  onChoose,
  onEnter,
}: DailyArenaCardProps): React.JSX.Element {
  const t = useThemeColors();
  const joined = topic.viewerJoined && topic.viewerRoomId !== null;
  const settled = topic.viewerRoomStatus === 'SETTLED';
  const closed = topic.phase === 'closed';
  const canJoin = !joined && !closed && topic.status === 'live';

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={() => {
          hapticTap();
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Today's Arena. ${topic.title}`}
        style={[
          styles.card,
          { backgroundColor: t.surface, borderColor: t.border, shadowColor: t.shadowColor },
        ]}
      >
        <View style={styles.head}>
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            TODAY'S ARENA
          </Text>
          {closed ? (
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              Closed
            </Text>
          ) : (
            <LivePulse />
          )}
        </View>

        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {topic.title}
        </Text>

        {topic.description ? (
          <Text
            allowFontScaling={false}
            numberOfLines={2}
            style={[styles.description, { color: t.textSecondary }]}
          >
            {topic.description}
          </Text>
        ) : null}

        <View style={styles.statRow}>
          <Text allowFontScaling={false} style={[styles.stat, { color: t.textSecondary }]}>
            {plural(topic.participantCount, 'person arguing', 'people arguing')}
          </Text>
          <Text allowFontScaling={false} style={[styles.dot, { color: t.textMuted }]}>
            ·
          </Text>
          <Text allowFontScaling={false} style={[styles.stat, { color: t.textSecondary }]}>
            {closed ? phaseLabel(topic.phase) : `${secondsLabel(topic.secondsRemaining)} left`}
          </Text>
        </View>

        {joined ? (
          <View style={styles.joinedBlock}>
            {topic.viewerStance ? (
              <View
                style={[styles.stanceChip, { backgroundColor: softFill(t), borderColor: t.border }]}
              >
                <Text allowFontScaling={false} style={[styles.stanceChipText, { color: t.textSecondary }]}>
                  Your stance · {STANCE_LABEL[topic.viewerStance]}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                hapticTap();
                onEnter();
              }}
              accessibilityRole="button"
              accessibilityLabel={settled ? 'See the verdict' : 'Enter your room'}
              style={[styles.primary, { backgroundColor: t.pill }]}
            >
              <Text allowFontScaling={false} style={[styles.primaryText, { color: t.pillText }]}>
                {settled ? 'See the verdict' : 'Enter your room'}
              </Text>
            </Pressable>
          </View>
        ) : canJoin ? (
          <View style={styles.gate}>
            <Text allowFontScaling={false} style={[styles.prompt, { color: t.textMuted }]}>
              What do you believe?
            </Text>
            <View style={styles.choices}>
              <ChoiceButton label="Agree" onPress={() => onChoose('AGREE')} />
              <ChoiceButton label="Unsure" onPress={() => onChoose('UNSURE')} />
              <ChoiceButton label="Disagree" onPress={() => onChoose('DISAGREE')} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              hapticTap();
              onOpen();
            }}
            accessibilityRole="button"
            accessibilityLabel="See how it ended"
            style={[styles.secondary, { borderColor: t.borderStrong }]}
          >
            <Text allowFontScaling={false} style={[styles.secondaryText, { color: t.textPrimary }]}>
              See how it ended
            </Text>
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

function ChoiceButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.choice, { backgroundColor: t.surfaceMuted, borderColor: t.borderStrong }]}
    >
      <Text allowFontScaling={false} style={[styles.choiceText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: layout.screenX, paddingTop: space.md },
  card: {
    gap: space.sm,
    padding: layout.cardPadding,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  meta: { ...typeScale.caption, fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  title: {
    ...typeScale.editorial,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  description: { ...typeScale.meta, fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  stat: { ...typeScale.meta, fontSize: 13 },
  dot: { ...typeScale.meta, fontSize: 13 },
  joinedBlock: { gap: space.sm, marginTop: 2 },
  stanceChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stanceChipText: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  gate: { gap: space.xs, marginTop: 2 },
  prompt: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  choices: { flexDirection: 'row', gap: space.xs },
  choice: {
    flex: 1,
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
  },
  choiceText: { ...typeScale.button, fontSize: 13, fontWeight: '700' },
  primary: {
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  primaryText: { ...typeScale.button, fontSize: 15, fontWeight: '700' },
  secondary: {
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  secondaryText: { ...typeScale.button, fontSize: 15, fontWeight: '600' },
});
