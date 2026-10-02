import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic, Stance } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { plural } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { LivePulse } from './LivePulse';
import { phaseLabel, secondsLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export interface ArenaTopicDeckCardProps {
  topic: LiveArenaTopic;
  /** Active front card — only the front card receives pointer events from the deck. */
  active: boolean;
  onOpen: () => void;
  onChoose: (stance: Stance) => void;
  onWatch: () => void;
  onEnter: () => void;
  onJoinDebate: () => void;
}

/**
 * Single editorial surface inside the Arena topic deck.
 * Presentation only — all join / room / stance writes stay with the parent callbacks.
 */
export function ArenaTopicDeckCard({
  topic,
  active,
  onOpen,
  onChoose,
  onWatch,
  onEnter,
  onJoinDebate,
}: ArenaTopicDeckCardProps): React.JSX.Element {
  const t = useThemeColors();
  const closed = topic.phase === 'closed';
  const settled = topic.viewerRoomStatus === 'SETTLED';
  const isSpectator = topic.viewerJoined && topic.viewerRole === 'spectator';
  // Joined without an explicit spectator role keeps the prior debater entry path.
  const isDebater = topic.viewerJoined && !isSpectator;
  const canJoin = !topic.viewerJoined && !closed && topic.status === 'live';
  const stance = topic.viewerStance ?? topic.viewerFinalStance;

  return (
    <Pressable
      disabled={!active}
      onPress={() => {
        hapticTap();
        if (isDebater || settled) onEnter();
        else if (isSpectator) onEnter();
        else onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={cardA11yLabel(topic)}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
        },
      ]}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          TODAY'S ARENA
        </Text>
        {closed ? (
          <Text allowFontScaling={false} style={[styles.closed, { color: t.textMuted }]}>
            Closed
          </Text>
        ) : (
          <LivePulse />
        )}
      </View>

      <Text allowFontScaling={false} numberOfLines={4} style={[styles.title, { color: t.textPrimary }]}>
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
          {plural(topic.participantCount, 'person participating', 'people participating')}
        </Text>
        <Text allowFontScaling={false} style={[styles.dot, { color: t.textMuted }]}>
          ·
        </Text>
        <Text allowFontScaling={false} style={[styles.stat, { color: t.textSecondary }]}>
          {closed ? phaseLabel(topic.phase) : `${secondsLabel(topic.secondsRemaining)} left`}
        </Text>
      </View>

      <View style={styles.cta}>
        {settled ? (
          <PrimaryButton label="See result" onPress={onEnter} />
        ) : isDebater ? (
          <View style={styles.joinedBlock}>
            {stance ? (
              <View style={[styles.stanceChip, { backgroundColor: softFill(t), borderColor: t.border }]}>
                <Text allowFontScaling={false} style={[styles.stanceChipText, { color: t.textSecondary }]}>
                  You · {STANCE_LABEL[stance]}
                </Text>
              </View>
            ) : null}
            <PrimaryButton label="Enter your room" onPress={onEnter} />
          </View>
        ) : isSpectator ? (
          <View style={styles.joinedBlock}>
            <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
              Watching
            </Text>
            <PrimaryButton label="Join the debate" onPress={onJoinDebate} />
          </View>
        ) : canJoin ? (
          <View style={styles.gate}>
            <Text allowFontScaling={false} style={[styles.prompt, { color: t.textMuted }]}>
              What do you think?
            </Text>
            <View style={styles.choices}>
              <ChoiceButton label="Agree" onPress={() => onChoose('AGREE')} />
              <ChoiceButton label="Unsure" onPress={() => onChoose('UNSURE')} />
              <ChoiceButton label="Disagree" onPress={() => onChoose('DISAGREE')} />
            </View>
            <Pressable
              onPress={() => {
                hapticTap();
                onWatch();
              }}
              accessibilityRole="button"
              accessibilityLabel="Watch live"
              hitSlop={8}
              style={styles.watchLink}
            >
              <Text allowFontScaling={false} style={[styles.watchText, { color: t.textSecondary }]}>
                Watch live
              </Text>
            </Pressable>
          </View>
        ) : (
          <SecondaryButton label="See how it ended" onPress={onOpen} />
        )}
      </View>
    </Pressable>
  );
}

function cardA11yLabel(topic: LiveArenaTopic): string {
  const live = topic.phase === 'closed' ? 'Closed' : 'Live';
  return `Today's Arena. ${topic.title}. ${live}. ${plural(
    topic.participantCount,
    'person participating',
    'people participating',
  )}`;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.primary, { backgroundColor: t.pill }]}
    >
      <Text allowFontScaling={false} style={[styles.primaryText, { color: t.pillText }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.secondary, { borderColor: t.borderStrong }]}
    >
      <Text allowFontScaling={false} style={[styles.secondaryText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </PressableScale>
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
    <PressableScale
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
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: space.sm,
    padding: layout.cardPadding + 2,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    justifyContent: 'flex-start',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  closed: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  title: {
    ...typeScale.editorial,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  description: {
    ...typeScale.meta,
    fontSize: 13,
    lineHeight: 19,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  stat: { ...typeScale.meta, fontSize: 13 },
  dot: { ...typeScale.meta, fontSize: 13 },
  cta: {
    marginTop: 'auto',
    paddingTop: space.sm,
  },
  joinedBlock: { gap: space.sm },
  watching: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  stanceChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stanceChipText: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  gate: { gap: space.xs },
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
  watchLink: {
    alignSelf: 'center',
    paddingVertical: space.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  watchText: {
    ...typeScale.button,
    fontSize: 14,
    fontWeight: '600',
  },
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
  },
  secondaryText: { ...typeScale.button, fontSize: 15, fontWeight: '600' },
});
