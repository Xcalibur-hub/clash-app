/** Communities tab — entry into Crew discovery / membership. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CrewListCard } from '../crews/CrewListCard';
import { listArenaCrews, listMyArenaCrews, type ArenaCrew } from '../../services/arenaCrewService';
import { useAuth } from '../../store/AuthProvider';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export interface ArenaCommunityProps {
  onParticipate?: () => void;
  refreshToken?: number;
}

export function ArenaCommunity({
  onParticipate,
  refreshToken = 0,
}: ArenaCommunityProps): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const { signedIn } = useAuth();
  const [mine, setMine] = React.useState<ArenaCrew[]>([]);
  const [crews, setCrews] = React.useState<ArenaCrew[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);
      setFailed(false);
      void Promise.all([
        signedIn ? listMyArenaCrews() : Promise.resolve([] as ArenaCrew[]),
        signedIn
          ? listArenaCrews({ limit: 24, offset })
          : Promise.resolve([] as ArenaCrew[]),
      ])
        .then(([own, page]) => {
          if (!active) return;
          setMine(own);
          setCrews(page);
          setHasMore(page.length === 24);
        })
        .catch(() => {
          if (!active) return;
          setMine([]);
          setCrews([]);
          setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [signedIn, refreshToken, offset]),
  );

  return (
    <View style={styles.wrap} accessibilityLabel="Communities">
      <Text style={[styles.title, { color: t.textPrimary }]}>Communities</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>
        Your Crews, shared interests, and real people. Membership never determines your vote.
      </Text>

      {!signedIn ? (
        <Pressable
          style={styles.link}
          accessibilityRole="button"
          onPress={() => router.push('/auth')}
        >
          <Text style={{ color: t.textPrimary }}>Sign in to explore Crews</Text>
        </Pressable>
      ) : loading ? (
        <Text style={{ color: t.textMuted }}>Loading communities…</Text>
      ) : failed ? (
        <Text style={{ color: t.textMuted }}>Couldn’t load communities. Pull down to retry.</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[styles.name, { color: t.textPrimary }]}>Your Crews</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open full Crews list"
              onPress={() => router.push('/arena/crews')}
            >
              <Text style={{ color: t.textPrimary }}>See all</Text>
            </Pressable>
          </View>
          {mine.length ? (
            mine.map((crew) => (
              <CrewListCard
                key={crew.id}
                crew={crew}
                onPress={() => router.push(`/arena/crews/${crew.slug}`)}
              />
            ))
          ) : (
            <Text style={{ color: t.textMuted, marginBottom: space.sm }}>
              You haven’t joined or followed a Crew.
            </Text>
          )}

          <View style={styles.row}>
            <Text style={[styles.name, { color: t.textPrimary }]}>Explore Crews</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a Crew"
              onPress={() => router.push('/arena/crews/create')}
            >
              <Text style={{ color: t.textPrimary }}>Create</Text>
            </Pressable>
          </View>
          {crews.length ? (
            crews.map((crew) => (
              <CrewListCard
                key={crew.id}
                crew={crew}
                onPress={() => router.push(`/arena/crews/${crew.slug}`)}
              />
            ))
          ) : (
            <Text style={{ color: t.textMuted }}>No communities available.</Text>
          )}

          <View style={styles.pages}>
            {offset > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setOffset((n) => Math.max(0, n - 24))}
                style={styles.link}
              >
                <Text style={{ color: t.textPrimary }}>Previous</Text>
              </Pressable>
            ) : null}
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setOffset((n) => n + 24)}
                style={styles.link}
              >
                <Text style={{ color: t.textPrimary }}>Next</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}

      {onParticipate ? (
        <Pressable style={styles.link} accessibilityRole="button" onPress={onParticipate}>
          <Text style={{ color: t.textPrimary }}>Back to Home</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  title: { ...typeScale.title },
  body: { ...typeScale.body, marginBottom: space.sm },
  name: { ...typeScale.label, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  link: { minHeight: 44, justifyContent: 'center' },
  pages: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
});
