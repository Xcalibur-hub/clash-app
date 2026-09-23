import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DAILY_DROP, dropNumber } from '../../data/dailyDrop';
import { HOOD_LABEL } from '../../data/hoods';
import { selectAuthor, useClash } from '../../store';
import { useClock } from '../../hooks/useClock';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { ClashSnapshotCard } from '../../components/shared/ClashSnapshotCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { ClockIcon } from '../../components/shared/icons';
import { compact, formatReputation, timeLeftLabel } from '../../utils/format';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';

/** The purge lands at 21:00 local; past that the countdown rolls to tomorrow (spec §12). */
function nextDropAt(now: number): number {
  const drop = new Date(now);
  drop.setHours(21, 0, 0, 0);
  if (drop.getTime() <= now) drop.setDate(drop.getDate() + 1);
  return drop.getTime();
}

/**
 * 9:00 PM DAILY DROP (spec §12): the countdown to the nightly purge and the three
 * clashes the Arena handpicked tonight (reference screen 12).
 */
export default function DailyDropScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useClash();
  const now = useClock();
  const dropAt = nextDropAt(now);

  // Resolve each curated clash against live state so nothing is denormalised.
  const cards = React.useMemo(
    () =>
      DAILY_DROP.flatMap((entry) => {
        const take = state.takes.find((item) => item.id === entry.takeId);
        const clash = state.clashes.find((item) => item.id === entry.clashId);
        if (!take || !clash) return [];
        const author = selectAuthor(state, take.authorId);
        const challenger = selectAuthor(state, clash.challengerId);
        if (!author || !challenger) return [];
        return [{ entry, take, clash, author, challenger }];
      }),
    [state],
  );

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <SectionHeading eyebrow="EVERY NIGHT · 9:00 PM" title="Daily Drop" editorial marked />
        <Text style={styles.subtitle}>
          Today&apos;s best clashes, handpicked.
        </Text>

        <View style={styles.banner}>
          <View style={styles.bannerRow}>
            <ClockIcon size={18} color={accent.gold} strokeWidth={2.4} />
            <Text style={styles.bannerLabel}>PURGE IN</Text>
          </View>
          <Text style={styles.bannerValue}>{timeLeftLabel(dropAt, now)}</Text>
        </View>

        <View style={styles.cards}>
          {cards.length === 0 ? (
            <EmptyState
              icon={ClockIcon}
              title="Tonight's drop is still curating."
              body="Three clashes are handpicked every night at 9:00 PM from whatever the Arena is arguing about."
            />
          ) : (
            cards.map(({ entry, take, clash, author, challenger }) => (
              <ClashSnapshotCard
                key={entry.id}
                take={take}
                author={author}
                challenger={challenger}
                challengerText={clash.challengerText}
                number={dropNumber(entry.rank)}
                title={HOOD_LABEL[take.hood].toUpperCase()}
                tag={`🔥 ${compact(take.reactions)} REACTIONS`}
                engagementLabel={`${formatReputation(clash.engagement)} watching`}
                result={{
                  score: { a: entry.scoreA, b: entry.scoreB },
                  winningSide: entry.winningSide,
                }}
                onOpenClash={() => router.push(`/clash/${take.id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  subtitle: { ...typeScale.body, color: ink.secondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPadding,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(255,200,97,0.32)',
    backgroundColor: 'rgba(255,200,97,0.08)',
    marginTop: space.sm,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bannerLabel: { ...typeScale.eyebrow, color: accent.gold },
  bannerValue: { ...typeScale.dataLg, fontSize: 17, color: ink.primary },
  cards: { gap: layout.feedGap, marginTop: space.sm },
});

