import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import type { Clash, ClashResult, Judgement, Take, User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { clashStyles as s, HEADER_SLOT } from './clashStyles';
import { Chip } from '../shared/Chip';
import { IconButton } from '../shared/IconButton';
import { BackIcon, HashIcon } from '../shared/icons';
import { ClashResult as ClashResultView } from './ClashResult';
import { JuryPanel } from './JuryPanel';
import { RecordedBanner } from './RecordedBanner';
import { TakePanel } from './TakePanel';
import { duel, ink, radius, space, typeScale } from '../../theme';

export type ClashStage = 'battle' | 'recorded' | 'result';

export interface ClashBodyProps {
  take: Take;
  author: User;
  challenger: User;
  clash: Clash;
  storedResult: ClashResult | undefined;
  revealed: boolean;
  stage: ClashStage;
  judgement: Judgement | undefined;
  paddingTop: number;
  paddingBottom: number;
  onChoose: (judgement: Judgement) => void;
  onLeave: () => void;
  onDone: () => void;
}

/** The duel itself: centered debate focus with clean A/B buttons. */
export function ClashBody({
  take,
  author,
  challenger,
  clash,
  storedResult,
  revealed,
  stage,
  judgement,
  paddingTop,
  paddingBottom,
  onChoose,
  onLeave,
  onDone,
}: ClashBodyProps): React.JSX.Element {
  const winnerATake = storedResult?.winningSide === 'A';
  const winnerHandle = storedResult
    ? winnerATake
      ? author.handle
      : challenger.handle
    : '';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[s.content, { paddingTop, paddingBottom }]}
    >
      <View style={s.topRow}>
        <IconButton
          icon={BackIcon}
          onPress={onLeave}
          label="Back to the Arena"
          size={HEADER_SLOT}
        />
        <Text allowFontScaling={false} style={s.title}>
          CLASH
        </Text>
        <View style={s.topSlot} />
      </View>

      <View style={styles.contextRow}>
        <Chip label={HOOD_LABEL[take.hood].toUpperCase()} icon={HashIcon} tone="violet" />
        <Chip label={`${clash.engagement} WATCHING`} tone="neutral" data />
      </View>

      {/* Centered debate focus */}
      <View style={styles.debateContainer}>
        <View style={[styles.takePanel, { borderColor: duel.aLine }]}>
          <Text allowFontScaling={false} style={styles.takeLabel}>
            TAKE A
          </Text>
          <Text allowFontScaling={false} style={styles.authorHandle}>
            @{author.handle}
          </Text>
          <Text allowFontScaling={false} style={styles.takeText}>
            {take.text}
          </Text>
        </View>

        <View style={styles.vsCircle}>
          <Text allowFontScaling={false} style={styles.vsText}>
            VS
          </Text>
        </View>

        <View style={[styles.takePanel, { borderColor: duel.bLine }]}>
          <Text allowFontScaling={false} style={styles.takeLabel}>
            TAKE B
          </Text>
          <Text allowFontScaling={false} style={styles.authorHandle}>
            @{challenger.handle}
          </Text>
          <Text allowFontScaling={false} style={styles.takeText}>
            {clash.challengerText}
          </Text>
        </View>
      </View>

      {/* Clean prompt and buttons */}
      {stage === 'battle' ? (
        <Animated.View exiting={FadeOut.duration(200)} style={styles.promptSection}>
          <Text allowFontScaling={false} style={styles.prompt}>
            WHICH ONE?
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => onChoose('A')}
              style={[styles.choiceButton, judgement === 'A' && styles.choiceButtonActive]}
              accessibilityRole="button"
              accessibilityLabel="Vote for Take A"
            >
              <Text allowFontScaling={false} style={[styles.choiceText, judgement === 'A' && styles.choiceTextActive]}>
                A
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onChoose('B')}
              style={[styles.choiceButton, judgement === 'B' && styles.choiceButtonActive]}
              accessibilityRole="button"
              accessibilityLabel="Vote for Take B"
            >
              <Text allowFontScaling={false} style={[styles.choiceText, judgement === 'B' && styles.choiceTextActive]}>
                B
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {stage === 'recorded' ? (
        <Animated.View exiting={FadeOut.duration(200)}>
          <RecordedBanner />
        </Animated.View>
      ) : null}

      <JuryPanel
        jurors={clash.jurors}
        reveal={revealed}
      />

      {revealed && storedResult ? (
        <ClashResultView
          result={storedResult}
          winnerHandle={winnerHandle}
          winnerLabel={`TAKE ${storedResult.winningSide}`}
          onDone={onDone}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  debateContainer: {
    marginTop: space.xl,
    gap: space.lg,
  },
  takePanel: {
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  takeLabel: {
    ...typeScale.eyebrow,
    color: ink.primary,
    marginBottom: space.xs,
  },
  authorHandle: {
    ...typeScale.label,
    color: ink.secondary,
    marginBottom: space.sm,
  },
  takeText: {
    ...typeScale.takeText,
    color: ink.primary,
  },
  vsCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: duel.aSoft,
    borderWidth: 2,
    borderColor: duel.aLine,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  vsText: {
    ...typeScale.cardTitle,
    color: ink.primary,
    fontWeight: '800',
  },
  promptSection: {
    marginTop: space.xl,
    alignItems: 'center',
  },
  prompt: {
    ...typeScale.section,
    color: ink.primary,
    marginBottom: space.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: space.lg,
  },
  choiceButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceButtonActive: {
    backgroundColor: duel.aSoft,
    borderColor: duel.aLine,
  },
  choiceText: {
    ...typeScale.title,
    color: ink.primary,
    fontSize: 28,
  },
  choiceTextActive: {
    color: ink.primary,
  },
});

