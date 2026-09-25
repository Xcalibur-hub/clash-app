import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import type { Clash, ClashResult, Judgement, Take, User } from '../../store';
import { plural } from '../../utils/format';
import { ink, space, typeScale } from '../../theme';
import { IconButton } from '../shared/IconButton';
import { BackIcon } from '../shared/icons';
import { clashStyles as s, HEADER_SLOT } from './clashStyles';
import { ChoiceButton } from './ChoiceButton';
import { ClashResult as ClashResultView } from './ClashResult';
import { JuryPanel } from './JuryPanel';
import { RecordedBanner } from './RecordedBanner';
import { TakePanel } from './TakePanel';
import { VersusHeader } from './VersusHeader';

export type ClashStage = 'battle' | 'recorded' | 'result';

export interface ClashBodyProps {
  take: Take;
  author: User;
  challenger: User;
  challengerText?: string;
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
  onNextClash?: () => void;
}

/**
 * THE CLASH — the fast voting surface (PRD §9–§10).
 *
 * Before the ballot the screen answers exactly one question ("WHICH ONE?") with
 * two takes and two side-tinted pucks — one tap commits. The 9-person jury
 * stays hidden until the verdict lands, and even then it reads only as deeper
 * detail below the result, never as a gate in front of it.
 */
export function ClashBody({
  take,
  author,
  challenger,
  challengerText,
  clash,
  storedResult,
  revealed,
  stage,
  paddingTop,
  paddingBottom,
  onChoose,
  onLeave,
  onDone,
  onNextClash,
}: ClashBodyProps): React.JSX.Element {
  const winnerSide = storedResult?.winningSide;
  const verdictShown = revealed && storedResult !== undefined;
  const winnerHandle = storedResult
    ? winnerSide === 'A'
      ? author.handle
      : challenger.handle
    : '';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[s.content, { paddingTop, paddingBottom }]}
    >
      <View style={s.topRow}>
        <IconButton icon={BackIcon} onPress={onLeave} label="Back to the Arena" size={HEADER_SLOT} />
        <Text allowFontScaling={false} style={s.title}>
          CLASH
        </Text>
        <View style={s.topSlot} />
      </View>

      {stage === 'battle' ? (
        <Animated.View exiting={FadeOut.duration(160)} style={styles.promptWrap}>
          <Text allowFontScaling={false} style={styles.prompt}>
            WHICH ONE?
          </Text>
        </Animated.View>
      ) : null}

      <View style={styles.debate}>
        <TakePanel
          side="A"
          author={author}
          text={take.text}
          label="TAKE A"
          winner={verdictShown && winnerSide === 'A'}
          faded={verdictShown && winnerSide !== 'A'}
        />
        <VersusHeader />
        <TakePanel
          side="B"
          author={challenger}
          text={challengerText ?? clash.challengerText}
          label="TAKE B"
          winner={verdictShown && winnerSide === 'B'}
          faded={verdictShown && winnerSide !== 'B'}
        />
      </View>

      {stage === 'battle' ? (
        <Animated.View exiting={FadeOut.duration(160)} style={styles.voteBlock}>
          <View style={styles.puckRow}>
            <ChoiceButton side="A" handle={author.handle} onChoose={onChoose} />
            <ChoiceButton side="B" handle={challenger.handle} onChoose={onChoose} />
          </View>
          <Text allowFontScaling={false} style={styles.judging}>
            {`${plural(clash.engagement, 'person', 'people')} judging`}
          </Text>
        </Animated.View>
      ) : null}

      {stage === 'recorded' ? (
        <Animated.View exiting={FadeOut.duration(160)}>
          <RecordedBanner />
        </Animated.View>
      ) : null}

      {storedResult && verdictShown ? (
        <ClashResultView
          result={storedResult}
          winnerHandle={winnerHandle}
          winnerLabel={`TAKE ${storedResult.winningSide}`}
          onDone={onDone}
          onNextClash={onNextClash}
        />
      ) : null}

      {/* Jury mechanics only after the verdict — deeper detail, not a gate (§10). */}
      {stage === 'result' && revealed ? <JuryPanel jurors={clash.jurors} reveal /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  promptWrap: { alignItems: 'center' },
  prompt: { ...typeScale.section, color: ink.primary, letterSpacing: 1.4 },
  debate: { gap: space.md },
  voteBlock: { alignItems: 'center', gap: space.md },
  puckRow: { flexDirection: 'row', gap: space.lg, alignSelf: 'stretch' },
  judging: { ...typeScale.meta, color: ink.quaternary },
});
