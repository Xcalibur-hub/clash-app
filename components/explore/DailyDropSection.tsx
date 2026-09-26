import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DAILY_DROP, dropNumber } from '../../data/dailyDrop';
import { HOOD_LABEL } from '../../data/hoods';
import { useClock } from '../../hooks/useClock';
import {
  selectAuthor,
  selectClashForTake,
  selectFeed,
  selectResult,
  selectTopComment,
  useClash,
} from '../../store';
import { compact, formatReputation, timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Chip } from '../shared/Chip';
import { ClashSnapshotCard } from '../shared/ClashSnapshotCard';
import { SectionHeading } from '../shared/SectionHeading';
import { ClockIcon } from '../shared/icons';
import { exploreStyles as s } from './exploreStyles';

/** The purge lands at 21:00 local; past that the countdown rolls to tomorrow (spec §12). */
function nextDropAt(now: number): number {
  const drop = new Date(now);
  drop.setHours(21, 0, 0, 0);
  if (drop.getTime() <= now) drop.setDate(drop.getDate() + 1);
  return drop.getTime();
}

/**
 * Daily Drop (PRD §16): one strong featured clash under a quiet heading — a
 * major discovery feature, not a front page. The countdown rides the heading.
 */
export function DailyDropSection(): React.JSX.Element {
  const router = useRouter();
  const { state } = useClash();
  const now = useClock();
  const dropAt = nextDropAt(now);

  const card = React.useMemo(() => {
    for (const entry of DAILY_DROP) {
      const take = state.takes.find((item) => item.id === entry.takeId);
      const clash = state.clashes.find((item) => item.id === entry.clashId);
      if (!take || !clash) continue;
      const author = selectAuthor(state, take.authorId);
      const challenger = selectAuthor(state, clash.challengerId);
      if (!author || !challenger) continue;
      return { rank: entry.rank, take, clash, author, challenger };
    }
    // High-heat fallback: the hottest live debate leads when the curated shelf
    // has no resolvable entry, so the drop always opens a real clash.
    for (const take of selectFeed(state, 'for-you', now)) {
      const clash = selectClashForTake(state, take.id);
      const author = selectAuthor(state, take.authorId);
      const challenger = clash ? selectAuthor(state, clash.challengerId) : undefined;
      if (!clash || !author || !challenger) continue;
      return { rank: 1, take, clash, author, challenger };
    }
    return null;
  }, [now, state]);

  // The snapshot mirrors the live lifecycle: Take B is the community's top
  // rebuttal, and the verdict only appears once the jury files it at expiry.
  const storedResult = card ? selectResult(state, card.clash.id) : undefined;
  const topComment = card ? selectTopComment(state, card.take.id) : undefined;

  const openClash = (takeId: string): void => {
    hapticTap();
    router.push(`/clash/${takeId}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading
        eyebrow="DAILY DROP · 9:00 PM"
        title="Featured Clash"
        accessory={<Chip label={timeLeftLabel(dropAt, now)} icon={ClockIcon} tone="gold" data />}
      />
      {card ? (
        <ClashSnapshotCard
          take={card.take}
          author={card.author}
          challenger={card.challenger}
          challengerText={topComment?.text ?? card.clash.challengerText}
          number={dropNumber(card.rank)}
          title={HOOD_LABEL[card.take.hood].toUpperCase()}
          tag={`🔥 ${compact(card.take.reactions)} REACTIONS`}
          engagementLabel={`${formatReputation(card.clash.engagement)} watching`}
          result={
            storedResult
              ? { score: storedResult.score, winningSide: storedResult.winningSide }
              : undefined
          }
          onOpenClash={() => openClash(card.take.id)}
        />
      ) : (
        <View style={s.emptyPanel}>
          <Text allowFontScaling={false} style={s.emptyText}>
            Tonight&apos;s drop is still curating.
          </Text>
        </View>
      )}
    </View>
  );
}
