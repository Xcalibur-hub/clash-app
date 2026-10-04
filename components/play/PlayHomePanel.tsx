import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ExploreDiscoveryCard } from '../explore/ExploreDiscoveryCard';
import { analytics } from '../../services/analytics';
import {
  fetchPlayHome,
  type PlayChallengeCard,
  type PlayHome,
  type PlayTreasureCard,
} from '../../services/playService';
import { partitionPlayChallenges, partitionPlayTreasures } from '../../utils/playRails';
import { space, typeScale, useThemeColors } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { useClock } from '../../hooks/useClock';

type PlayTab = 'challenges' | 'treasure';

function Rail({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const t = useThemeColors();
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <View style={styles.railBlock}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textPrimary }]}>
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {children}
      </ScrollView>
    </View>
  );
}

function ChallengeTile({
  item,
  now,
  onPress,
}: {
  item: PlayChallengeCard;
  now: number;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <ExploreDiscoveryCard
      kind="CHALLENGE"
      title={item.title}
      subtitle={`${item.challengeType}${item.countryCode ? ` · ${item.countryCode}` : ''}`}
      meta={`${item.entryCount} entries · ${timeLeftLabel(item.endsAt, now)}`}
      mediaUrl={item.coverUrl}
      accent="#24362E"
      width={220}
      height={260}
      onPress={onPress}
    />
  );
}

function TreasureTile({
  item,
  now,
  onPress,
}: {
  item: PlayTreasureCard;
  now: number;
  onPress: () => void;
}): React.JSX.Element {
  const gifts =
    item.giftsRemaining == null ? 'Unlimited gifts' : `${item.giftsRemaining} gifts left`;
  return (
    <ExploreDiscoveryCard
      kind="TREASURE"
      title={item.title}
      subtitle={item.clue}
      meta={`${gifts} · ${timeLeftLabel(item.endsAt, now)}`}
      mediaUrl={item.coverUrl}
      accent="#2A2438"
      width={240}
      height={270}
      onPress={onPress}
    />
  );
}

export function PlayHomePanel(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const now = useClock(30_000);
  const [tab, setTab] = React.useState<PlayTab>('challenges');
  const [home, setHome] = React.useState<PlayHome | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    analytics.track('play_opened', { realm: 'explore', source: 'explore' });
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPlayHome();
        if (alive) setHome(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load Play');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openChallenge = (id: string) => {
    analytics.track('challenge_opened', { realm: 'explore', source: 'explore' });
    router.push(`/explore/challenge/${id}` as never);
  };

  const openTreasure = (id: string) => {
    analytics.track('treasure_opened', { realm: 'explore', source: 'explore' });
    router.push(`/explore/treasure/${id}` as never);
  };

  const challengeRails = home ? partitionPlayChallenges(home.challenges, now) : null;
  const treasureRails = home ? partitionPlayTreasures(home.treasures, now) : null;

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          PLAY
        </Text>
        <Pressable
          onPress={() => {
            hapticTap();
            router.push('/explore/play/my' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="My Play"
        >
          <Text allowFontScaling={false} style={[styles.myPlay, { color: t.textMuted }]}>
            My Play
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['challenges', 'Challenges'],
            ['treasure', 'Treasure'],
          ] as const
        ).map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => {
                hapticTap();
                setTab(id);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                  borderColor: t.border,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.tabLabel, { color: on ? t.background : t.textPrimary }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? <ActivityIndicator color={t.textPrimary} style={{ marginTop: space.lg }} /> : null}
      {error ? (
        <Text allowFontScaling={false} style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}

      {!loading && !error && tab === 'challenges' ? (
        <>
          {(home?.challenges.length ?? 0) === 0 ? (
            <Text allowFontScaling={false} style={{ color: t.textMuted }}>
              No active challenges right now. Check back soon.
            </Text>
          ) : null}
          <Rail title="Featured">
            {challengeRails?.featured.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
          <Rail title="Ending Soon">
            {challengeRails?.endingSoon.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
          <Rail title="Global">
            {challengeRails?.global.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
          <Rail title="Country">
            {challengeRails?.country.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
          <Rail title="Creator-hosted">
            {challengeRails?.creator.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
          <Rail title="Joined">
            {challengeRails?.joined.map((c) => (
              <ChallengeTile key={c.id} item={c} now={now} onPress={() => openChallenge(c.id)} />
            ))}
          </Rail>
        </>
      ) : null}

      {!loading && !error && tab === 'treasure' ? (
        <>
          {(home?.treasures.length ?? 0) === 0 ? (
            <Text allowFontScaling={false} style={{ color: t.textMuted }}>
              No treasure hunts right now. New clues drop soon.
            </Text>
          ) : null}
          <Rail title="Featured">
            {treasureRails?.featured.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
          <Rail title="Ending Soon">
            {treasureRails?.endingSoon.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
          <Rail title="Global">
            {treasureRails?.global.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
          <Rail title="Country">
            {treasureRails?.country.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
          <Rail title="Creator-hosted">
            {treasureRails?.creator.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
          <Rail title="In Progress">
            {treasureRails?.inProgress.map((h) => (
              <TreasureTile key={h.id} item={h} now={now} onPress={() => openTreasure(h.id)} />
            ))}
          </Rail>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  myPlay: {
    fontFamily: typeScale.caption.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontFamily: typeScale.caption.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    fontFamily: typeScale.section.fontFamily,
    fontSize: 18,
    fontWeight: '700',
  },
  railBlock: { gap: space.sm },
  rail: { gap: space.sm, paddingRight: space.md },
});
