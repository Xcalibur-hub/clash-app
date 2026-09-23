import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { ClashResult as ClashResultModel } from '../../store';
import { accent } from '../../theme';
import { Chip } from '../shared/Chip';
import { GlowButton } from '../shared/GlowButton';
import { GavelIcon, ZapIcon } from '../shared/icons';
import { sideTone } from './duelPalette';
import { Particles } from './Particles';
import { ResultRewards } from './ResultRewards';
import { ScoreCircles } from './ScoreCircles';
import { resultStyles as s } from './resultStyles';

export interface ClashResultProps {
  result: ClashResultModel;
  /** Handle of the creator who won the clash. */
  winnerHandle: string;
  winnerLabel: string;
  onDone: () => void;
}

/**
 * The payoff of the loop (spec §10, reference screen 9): "CLASH WON", the jury
 * score in the duel's own colours, the rewards the call earned, the rank bar, and
 * exactly one way out — back to the Arena.
 */
export function ClashResult({
  result,
  winnerHandle,
  winnerLabel,
  onDone,
}: ClashResultProps): React.JSX.Element {
  return (
    <View style={s.wrap}>
      <Particles color={sideTone(result.winningSide).tone} trigger={result.resolvedAt} />

      <Animated.View entering={FadeInDown.duration(340)} style={s.headline}>
        <Text allowFontScaling={false} style={s.eyebrow}>
          VERDICT FILED
        </Text>
        <Text allowFontScaling={false} style={s.title}>
          CLASH WON
        </Text>
        <Text allowFontScaling={false} style={s.handle}>
          {`${winnerLabel} · @${winnerHandle} takes the clash`}
        </Text>
      </Animated.View>

      <ScoreCircles score={result.score} winningSide={result.winningSide} />

      <View style={s.scoreFooter}>
        <Chip label={result.verdict} icon={GavelIcon} tone="gold" />
      </View>

      <ResultRewards result={result} />

      <Animated.View entering={FadeInDown.delay(160).duration(360)} style={s.sparkRow}>
        <ZapIcon size={14} color={accent.violet} strokeWidth={2.4} />
        <Text allowFontScaling={false} style={s.sparkText}>
          Streak updated. Return at 9:00 PM for the Daily Drop.
        </Text>
      </Animated.View>

      <GlowButton
        label="Continue"
        tone="ink"
        pill
        onPress={onDone}
        style={s.continue}
        accessibilityLabel="Continue back to the Arena"
      />
    </View>
  );
}
