/** Communities reuse the committed Crew listing and membership projection. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listArenaCrews, listMyArenaCrews, type ArenaCrew } from '../../services/arenaCrewService';
import { useAuth } from '../../store/AuthProvider';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
export interface ArenaCommunityProps {
  onParticipate?: () => void;
  refreshToken?: number;
}
export function ArenaCommunity({
  onParticipate,
  refreshToken = 0
}: ArenaCommunityProps): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    {
      signedIn
    } = useAuth();
  const [mine, setMine] = React.useState<ArenaCrew[]>([]),
    [crews, setCrews] = React.useState<ArenaCrew[]>([]);
  const [loading, setLoading] = React.useState(true),
    [failed, setFailed] = React.useState(false),
    [offset, setOffset] = React.useState(0),
    [hasMore, setHasMore] = React.useState(false);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([signedIn ? listMyArenaCrews() : Promise.resolve([]), signedIn ? listArenaCrews({
      limit: 24,
      offset
    }) : Promise.resolve([])]).then(([own, page]) => {
      if (!active) return;
      setMine(own);
      setCrews(page);
      setHasMore(page.length === 24);
    }).catch(() => {
      if (active) {
        setMine([]);
        setCrews([]);
        setFailed(true);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [signedIn, refreshToken, offset]));
  const card = (crew: ArenaCrew) => <View key={crew.id} style={[styles.card, {
    borderColor: t.border
  }]}><Text style={[styles.name, {
      color: t.textPrimary
    }]}>{crew.name}</Text>
  <Text style={[styles.body, {
      color: t.textSecondary
    }]}>{crew.memberCount} members · {crew.followerCount} followers{crew.viewer.isMember ? ' · Your Crew' : crew.viewer.isFollowing ? ' · Following' : ''}</Text>
  {crew.bio ? <Text style={[styles.body, {
      color: t.textSecondary
    }]}>{crew.bio}</Text> : null}
  {crew.specialties.length ? <Text style={[styles.body, {
      color: t.textMuted
    }]}>{crew.specialties.join(' · ')}</Text> : null}
 </View>;
  return <View style={styles.wrap} accessibilityLabel="Communities">
  <Text style={[styles.title, {
      color: t.textPrimary
    }]}>Communities</Text><Text style={[styles.body, {
      color: t.textSecondary
    }]}>Your Crews, shared interests, and real people. Membership never determines your vote.</Text>
  {!signedIn ? <Pressable style={styles.link} accessibilityRole="button" onPress={() => router.push('/auth')}><Text style={{
        color: t.textPrimary
      }}>Sign in to explore Crews</Text></Pressable> : loading ? <Text style={{
      color: t.textMuted
    }}>Loading communities...</Text> : failed ? <Text style={{
      color: t.textMuted
    }}>Couldn't load communities. Pull down to retry.</Text> : <>
   <Text style={[styles.name, {
        color: t.textPrimary
      }]}>Your Crews</Text>{mine.length ? mine.map(card) : <Text style={{
        color: t.textMuted
      }}>You haven't joined or followed a Crew.</Text>}
   <Text style={[styles.name, {
        color: t.textPrimary
      }]}>Explore Crews</Text>{crews.length ? crews.map(card) : <Text style={{
        color: t.textMuted
      }}>No communities available.</Text>}
   <View style={styles.pages}>{offset > 0 ? <Pressable accessibilityRole="button" onPress={() => setOffset(n => Math.max(0, n - 24))} style={styles.link}><Text style={{
            color: t.textPrimary
          }}>Previous</Text></Pressable> : null}{hasMore ? <Pressable accessibilityRole="button" onPress={() => setOffset(n => n + 24)} style={styles.link}><Text style={{
            color: t.textPrimary
          }}>Next</Text></Pressable> : null}</View>
  </>}
  {onParticipate ? <Pressable style={styles.link} accessibilityRole="button" onPress={onParticipate}><Text style={{
        color: t.textPrimary
      }}>Back to Home</Text></Pressable> : null}
 </View>;
}
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm
  },
  title: {
    ...typeScale.section,
    fontSize: 24,
    fontWeight: '800'
  },
  name: {
    ...typeScale.label,
    fontSize: 18,
    fontWeight: '700'
  },
  body: {
    ...typeScale.meta,
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs
  },
  link: {
    minHeight: 44,
    justifyContent: 'center'
  },
  pages: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  }
});
