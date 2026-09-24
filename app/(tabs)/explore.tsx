import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DAILY_DROP, dropNumber } from '../../data/dailyDrop';
import { HOODS, HOOD_LABEL } from '../../data/hoods';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { selectAuthor, useClash, type User } from '../../store';
import { useClock } from '../../hooks/useClock';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { ClashSnapshotCard } from '../../components/shared/ClashSnapshotCard';
import { HoodRow } from '../../components/hof/HoodRow';
import { MuseumCard } from '../../components/hof/MuseumCard';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { ClockIcon } from '../../components/shared/icons';
import { compact, formatReputation, timeLeftLabel } from '../../utils/format';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/** The purge lands at 21:00 local; past that the countdown rolls to tomorrow (spec §12). */
function nextDropAt(now: number): number {
  const drop = new Date(now);
  drop.setHours(21, 0, 0, 0);
  if (drop.getTime() <= now) drop.setDate(drop.getDate() + 1);
  return drop.getTime();
}

/**
 * EXPLORE — Consolidated discovery hub for Daily Drop, Trending Hoods, and Hall of Fame.
 */
export default function ExploreScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useClash();
  const now = useClock();
  const dropAt = nextDropAt(now);

  // Resolve daily drop clashes against live state
  const dailyDropCards = React.useMemo(
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

  // Get trending hoods
  const trendingHoods = React.useMemo(
    () => [...HOODS].sort((a, b) => b.liveClashes - a.liveClashes).slice(0, 8),
    [],
  );

  // Get top creators for Hall of Fame
  const topCreators = React.useMemo(() => {
    const people: User[] = [];
    for (const id of Object.keys(state.users)) {
      const user = selectAuthor(state, id);
      if (user) people.push(user);
    }
    return people.sort((a, b) => b.reputation - a.reputation).slice(0, 5);
  }, [state]);

  const takeText = (takeId: string): string =>
    state.takes.find((item) => item.id === takeId)?.text ?? takeId;

  const openClash = (takeId: string): void => {
    hapticTap();
    router.push(`/clash/${takeId}`);
  };

  const openHood = (hoodId: string): void => {
    hapticTap();
    router.push(`/(tabs)?hood=${hoodId}`);
  };

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        {/* Section 1: Daily Drop */}
        <SectionHeading eyebrow="DAILY DROP · 9:00 PM" title="Featured Clash" editorial marked />
        <View style={styles.banner}>
          <View style={styles.bannerRow}>
            <ClockIcon size={18} color={accent.gold} strokeWidth={2.4} />
            <Text style={styles.bannerLabel}>PURGE IN</Text>
          </View>
          <Text style={styles.bannerValue}>{timeLeftLabel(dropAt, now)}</Text>
        </View>

        <View style={styles.dailyDropCard}>
          {dailyDropCards.length > 0 ? (
            <ClashSnapshotCard
              take={dailyDropCards[0].take}
              author={dailyDropCards[0].author}
              challenger={dailyDropCards[0].challenger}
              challengerText={dailyDropCards[0].clash.challengerText}
              number={dropNumber(dailyDropCards[0].entry.rank)}
              title={HOOD_LABEL[dailyDropCards[0].take.hood].toUpperCase()}
              tag={`🔥 ${compact(dailyDropCards[0].take.reactions)} REACTIONS`}
              engagementLabel={`${formatReputation(dailyDropCards[0].clash.engagement)} watching`}
              result={{
                score: { a: dailyDropCards[0].entry.scoreA, b: dailyDropCards[0].entry.scoreB },
                winningSide: dailyDropCards[0].entry.winningSide,
              }}
              onOpenClash={() => openClash(dailyDropCards[0].take.id)}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Tonight's drop is still curating.</Text>
            </View>
          )}
        </View>

        {/* Section 2: Trending Hoods */}
        <SectionHeading eyebrow="DISCOVER" title="Trending Hoods" editorial marked />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hoodScroll}
        >
          {trendingHoods.map((hood, index) => (
            <View key={hood.id} style={styles.hoodCard}>
              <HoodRow
                position={index + 1}
                hood={hood}
                tag="TRENDING"
                onPress={() => openHood(hood.id)}
              />
            </View>
          ))}
        </ScrollView>

        {/* Section 3: Hall of Fame */}
        <SectionHeading eyebrow="PERMANENT ARCHIVE" title="Hall of Fame" editorial marked />
        <Text allowFontScaling={false} style={styles.subtitle}>
          Some takes don&apos;t deserve to disappear.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hofScroll}
        >
          {HOF_ENTRIES.slice(0, 6).map((entry) => (
            <View key={entry.id} style={styles.hofCard}>
              <MuseumCard
                entry={entry}
                takeText={takeText(entry.takeId)}
                onOpen={() => openClash(entry.takeId)}
              />
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.lg },
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
  dailyDropCard: { marginTop: space.sm },
  emptyState: {
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  emptyText: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  hoodScroll: { gap: space.md },
  hoodCard: { width: 280 },
  hofScroll: { gap: space.md },
  hofCard: { width: 300 },
});