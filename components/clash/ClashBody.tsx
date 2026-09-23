import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import type { Clash, ClashResult, Judgement, Take, User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { clashStyles as s, HEADER_SLOT } from './clashStyles';
import { Chip } from '../shared/Chip';
import { IconButton } from '../shared/IconButton';
import { BackIcon, HashIcon } from '../shared/icons';
import { ClashResult as ClashResultView } from './ClashResult';
import { JudgementPicker } from './JudgementPicker';
import { JuryPanel } from './JuryPanel';
import { RecordedBanner } from './RecordedBanner';
import { TakePanel } from './TakePanel';
import { VersusHeader } from './VersusHeader';

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

/** The duel itself: two takes, the 9-person jury, the ballot and the verdict. */
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

      <View style={s.contextRow}>
        <Chip label={HOOD_LABEL[take.hood].toUpperCase()} icon={HashIcon} tone="violet" />
        <Chip label={`${clash.engagement} WATCHING`} tone="neutral" data />
      </View>

      <TakePanel
        side="A"
        author={author}
        text={take.text}
        label="TAKE A"
        winner={revealed && winnerATake}
        faded={revealed && !winnerATake}
      />
      <VersusHeader />
      <TakePanel
        side="B"
        author={challenger}
        text={clash.challengerText}
        label="TAKE B"
        winner={revealed && !winnerATake}
        faded={revealed && winnerATake}
      />

      <JuryPanel
        jurors={clash.jurors}
        reveal={revealed}
      />

      {stage === 'battle' ? (
        <Animated.View exiting={FadeOut.duration(200)}>
          <JudgementPicker
            handleA={author.handle}
            handleB={challenger.handle}
            chosen={judgement}
            locked={false}
            onChoose={onChoose}
          />
        </Animated.View>
      ) : null}

      {stage === 'recorded' ? (
        <Animated.View exiting={FadeOut.duration(200)}>
          <RecordedBanner />
        </Animated.View>
      ) : null}

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

