import React from 'react';
import { Text, View } from 'react-native';
import type { ClashResult as ClashResultModel } from '../../store';
import { radius } from '../../theme';
import { awardDescription } from '../../services/reputationService';
import { Chip } from '../shared/Chip';
import { GlassCard } from '../shared/GlassCard';
import { TrophyIcon } from '../shared/icons';
import { RankXpBar } from './RankXpBar';
import { RewardLedger } from './RewardLedger';
import { RewardStrip } from './RewardStrip';
import { resultStyles as s } from './resultStyles';

const ALIGNMENT: Record<
  ClashResultModel['alignment'],
  { label: string; tone: 'mint' | 'danger' | 'neutral' }
> = {
  majority: { label: 'YOU CALLED IT', tone: 'mint' },
  minority: { label: 'YOU WERE OUTVOTED', tone: 'danger' },
  abstained: { label: 'YOU ABSTAINED', tone: 'neutral' },
};

/**
 * The reward half of the reveal (spec §10–§11, reference screen 9): how the call
 * compared to the jury, the strip of what it paid, the ledger that explains the
 * number, and the "YOUR RANK" card with its animated bar.
 */
export function ResultRewards({ result }: { result: ClashResultModel }): React.JSX.Element {
  const alignment = ALIGNMENT[result.alignment];

  return (
    <View style={s.rewards}>
      <View style={s.alignmentRow}>
        <Chip label={alignment.label} tone={alignment.tone} icon={TrophyIcon} />
        <Text allowFontScaling={false} style={s.alignmentText}>
          {awardDescription(result.alignment)}
        </Text>
      </View>

      <RewardStrip reputation={result.reputation} coins={result.coins} />

      <RewardLedger events={result.events} />

      <GlassCard level="regular" corner={radius.card} style={s.rankCard}>
        <RankXpBar
          rankName={result.rankAfter}
          rankTitle={result.rankTitle}
          rankedUp={result.rankBefore !== result.rankAfter}
          progressBefore={result.progressBefore}
          progressAfter={result.progressAfter}
          nextRankName={result.nextRankName}
          toNextRank={result.toNextRank}
        />
      </GlassCard>
    </View>
  );
}
