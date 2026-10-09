import {withExploreAccount} from '../../../components/explore/ExploreAccountBoundary';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowButton } from '../../../components/shared/GlowButton';
import { WorldArtifactsSection } from '../../../components/play/WorldArtifactsSection';
import { fetchMyPlay, type MyPlay } from '../../../services/playService';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';

function Tile({
  title,
  meta,
  coverUrl,
  onPress,
}: {
  title: string;
  meta: string;
  coverUrl: string | null;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
    >
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.tileMedia} />
      ) : (
        <LinearGradient colors={['#2A2438', '#121214']} style={styles.tileMedia} />
      )}
      <View style={styles.tileCopy}>
        <Text allowFontScaling={false} style={[styles.tileTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textMuted }} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

function MyPlayScreen(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = React.useState<MyPlay | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mine = await fetchMyPlay();
        if (alive) setData(mine);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load My Play');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const inProgressChallenges =
    data?.challenges.filter((c) => c.status === 'active' && !c.hasEntry) ?? [];
  const submitted = data?.challenges.filter((c) => c.hasEntry) ?? [];
  const completedChallenges = data?.challenges.filter((c) => c.status === 'ended') ?? [];
  const inProgressTreasure =
    data?.treasures.filter((h) => !h.completed && h.progress >= 0) ?? [];
  const completedTreasure = data?.treasures.filter((h) => h.completed) ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingHorizontal: layout.screenX,
        paddingBottom: insets.bottom + space.xxl,
        gap: space.md,
      }}
    >
      <View style={styles.header}>
        <GlowButton label="Back" onPress={() => router.back()} tone="glass" compact />
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          MY PLAY
        </Text>
      </View>

      {loading ? <ActivityIndicator color={t.textPrimary} /> : null}
      {error ? (
        <Text allowFontScaling={false} style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}

      <Section title="In Progress">
        {[
          ...inProgressChallenges.map((c) => (
            <Tile
              key={`c-${c.id}`}
              title={c.title}
              meta="Challenge · joined"
              coverUrl={c.coverUrl}
              onPress={() => router.push(`/explore/challenge/${c.id}` as never)}
            />
          )),
          ...inProgressTreasure.map((h) => (
            <Tile
              key={`t-${h.id}`}
              title={h.title}
              meta={`Treasure · ${h.progress}/${h.clueCount}`}
              coverUrl={h.coverUrl}
              onPress={() => router.push(`/explore/treasure/${h.id}` as never)}
            />
          )),
        ]}
      </Section>

      <Section title="Submitted">
        {submitted.map((c) => (
          <Tile
            key={c.id}
            title={c.title}
            meta="Entry submitted"
            coverUrl={c.coverUrl}
            onPress={() => router.push(`/explore/challenge/${c.id}` as never)}
          />
        ))}
      </Section>

      <Section title="Completed">
        {[
          ...completedChallenges.map((c) => (
            <Tile
              key={`cc-${c.id}`}
              title={c.title}
              meta="Challenge complete"
              coverUrl={c.coverUrl}
              onPress={() => router.push(`/explore/challenge/${c.id}` as never)}
            />
          )),
          ...completedTreasure.map((h) => (
            <Tile
              key={`ct-${h.id}`}
              title={h.title}
              meta="Hunt complete"
              coverUrl={h.coverUrl}
              onPress={() => router.push(`/explore/treasure/${h.id}` as never)}
            />
          )),
        ]}
      </Section>

      <WorldArtifactsSection />

      <Section title="Rewards">
        {(data?.rewards ?? []).map((r) => (
          <Tile
            key={`${r.huntId}-${r.claimedAt}`}
            title={r.title}
            meta={(r.rewardMetadata.label as string) ?? r.rewardType}
            coverUrl={r.coverUrl}
            onPress={() => router.push(`/explore/treasure/${r.huntId}` as never)}
          />
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useThemeColors();
  const list = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
        {title}
      </Text>
      {list.length === 0 ? (
        <Text allowFontScaling={false} style={{ color: t.textMuted }}>
          Nothing here yet.
        </Text>
      ) : (
        <View style={styles.grid}>{list}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  title: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  section: { gap: space.sm },
  sectionTitle: {
    fontFamily: typeScale.section.fontFamily,
    fontSize: 17,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileMedia: { width: '100%', height: 110 },
  tileCopy: { padding: space.sm, gap: 4 },
  tileTitle: { fontWeight: '700', fontSize: 14 },
});

export default withExploreAccount(MyPlayScreen);
