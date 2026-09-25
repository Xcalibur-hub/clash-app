import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import { useClock } from '../../hooks/useClock';
import { selectAuthor, useClash, type Clash, type Take, type User } from '../../store';
import { tap as hapticTap } from '../../utils/haptics';
import { compact, formatReputation } from '../../utils/format';
import { ClashSnapshotCard } from '../shared/ClashSnapshotCard';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

interface TrendingCard {
  clash: Clash;
  take: Take;
  author: User;
  challenger: User;
}

/**
 * Trending (PRD §15): the three live clashes pulling the most jury attention,
 * rendered as visual snapshot cards. Expired takes drop off automatically.
 */
export function TrendingSection(): React.JSX.Element | null {
  const router = useRouter();
  const { state } = useClash();
  const now = useClock();

  const cards = React.useMemo<TrendingCard[]>(() => {
    const rows: TrendingCard[] = [];
    for (const clash of state.clashes) {
      const take = state.takes.find((item) => item.id === clash.takeId);
      const author = take ? selectAuthor(state, take.authorId) : undefined;
      const challenger = selectAuthor(state, clash.challengerId);
      if (!take || take.expiresAt <= now || !author || !challenger) continue;
      rows.push({ clash, take, author, challenger });
    }
    return rows.sort((a, b) => b.clash.engagement - a.clash.engagement).slice(0, 3);
  }, [now, state]);

  if (cards.length === 0) return null;

  const openClash = (takeId: string): void => {
    hapticTap();
    router.push(`/clash/${takeId}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="TRENDING" title="Judging right now" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
        {cards.map(({ clash, take, author, challenger }) => {
          const result = state.results[clash.id];
          return (
            <View key={clash.id} style={s.shelfCard}>
              <ClashSnapshotCard
                take={take}
                author={author}
                challenger={challenger}
                challengerText={clash.challengerText}
                title={HOOD_LABEL[take.hood].toUpperCase()}
                tag={`🔥 ${compact(take.reactions)} REACTIONS`}
                engagementLabel={`${formatReputation(clash.engagement)} watching`}
                result={result ? { score: result.score, winningSide: result.winningSide } : undefined}
                onOpenClash={() => openClash(take.id)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
