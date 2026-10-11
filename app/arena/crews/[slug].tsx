import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrewMembershipBar } from '../../../components/crews/CrewMembershipBar';
import { EmptyState } from '../../../components/shared/EmptyState';
import { BackIcon, CreatorsIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  followArenaCrew,
  getArenaCrew,
  joinArenaCrew,
  leaveArenaCrew,
  listMyArenaCrews,
  requestArenaCrewJoin,
  unfollowArenaCrew,
  type ArenaCrew,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { useAuth } from '../../../store/AuthProvider';
import {
  crewCrestInitials,
  crewJoinModeLabel,
  formatCrewMembers,
} from '../../../utils/arenaCrewIdentity';
import { arenaCrewUserMessage } from '../../../utils/arenaCrewPayload';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';

/** Crew detail — get_arena_crew + membership RPCs. No mock feed. */
export default function ArenaCrewDetailScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { signedIn } = useAuth();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = String(Array.isArray(params.slug) ? params.slug[0] : params.slug ?? '')
    .trim()
    .toLowerCase();

  const [crew, setCrew] = React.useState<ArenaCrew | null>(null);
  const [activeCrewId, setActiveCrewId] = React.useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const gen = React.useRef(0);
  const inFlight = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (!slug) {
      setCrew(null);
      setLoading(false);
      setError('Crew not found.');
      return;
    }
    const token = ++gen.current;
    setLoading(true);
    setError(null);
    try {
      const [row, mine] = await Promise.all([
        getArenaCrew(slug),
        signedIn ? listMyArenaCrews() : Promise.resolve([] as ArenaCrew[]),
      ]);
      if (token !== gen.current) return;
      setCrew(row);
      setActiveCrewId(mine[0]?.id ?? null);
      if (!row) setError('This Crew does not exist or is no longer available.');
    } catch (err) {
      if (token !== gen.current) return;
      setCrew(null);
      setError(errorText(err) || 'Could not load this Crew.');
    } finally {
      if (token === gen.current) setLoading(false);
    }
  }, [slug, signedIn]);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
      return () => {
        gen.current += 1;
      };
    }, [refresh]),
  );

  React.useEffect(() => {
    setCrew(null);
    setActiveCrewId(null);
    setPendingRequest(false);
    setNotice(null);
    setError(null);
  }, [signedIn]);

  const runMutation = async (fn: () => Promise<ArenaCrew | { id: string; status: string }>) => {
    if (!requireAuth()) return;
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await fn();
      if ('viewer' in result) {
        setCrew(result);
        if (result.viewer.isMember) {
          setActiveCrewId(result.id);
          setPendingRequest(false);
        } else if (activeCrewId === result.id) {
          setActiveCrewId(null);
        }
      } else if (result.status === 'PENDING' || result.status === 'pending') {
        setPendingRequest(true);
        setNotice('Join request sent.');
      }
      // Refresh mine / counts from server so UI never trusts optimism alone.
      await refresh();
    } catch (err) {
      setNotice(arenaCrewUserMessage(errorText(err)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/arena/crews'))}
        style={[styles.back, { paddingHorizontal: layout.screenX }]}
      >
        <BackIcon size={20} color={t.textPrimary} />
        <Text style={{ color: t.textPrimary }}>Back</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={t.textPrimary} />
      ) : error || !crew ? (
        <EmptyState
          icon={CreatorsIcon}
          title="Crew unavailable"
          body={error ?? 'This Crew could not be found.'}
          actionLabel="Browse Crews"
          onAction={() => router.replace('/arena/crews')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingBottom: insets.bottom + space.xl,
            gap: space.md,
          }}
        >
          <View style={styles.header}>
            <View style={[styles.crest, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
              <Text style={[styles.crestText, { color: t.textPrimary }]}>
                {crewCrestInitials(crew.name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.textPrimary }]}>{crew.name}</Text>
              <Text style={[styles.meta, { color: t.textSecondary }]}>@{crew.slug}</Text>
            </View>
          </View>

          {crew.bio.trim() ? (
            <Text style={[styles.bio, { color: t.textSecondary }]}>{crew.bio.trim()}</Text>
          ) : (
            <Text style={[styles.bio, { color: t.textMuted }]}>No description yet.</Text>
          )}

          <Text style={[styles.meta, { color: t.textSecondary }]}>
            {formatCrewMembers(crew.memberCount)}
            {' · '}
            {crewJoinModeLabel(crew.joinMode)}
            {crew.specialties.length ? ` · ${crew.specialties.join(' · ')}` : ''}
          </Text>

          {/* Wins/losses/streak are server columns; only show when non-zero. */}
          {crew.wins + crew.losses > 0 || crew.streak >= 2 ? (
            <Text style={[styles.meta, { color: t.textMuted }]}>
              {crew.wins + crew.losses > 0 ? `${crew.wins}–${crew.losses}` : null}
              {crew.streak >= 2 ? ` · ${crew.streak}-win streak` : null}
            </Text>
          ) : null}

          <CrewMembershipBar
            crew={crew}
            activeCrewId={activeCrewId}
            hasPendingRequest={pendingRequest}
            signedIn={signedIn}
            busy={busy}
            onSignIn={() => router.push('/auth')}
            onJoin={() => void runMutation(() => joinArenaCrew(crew.id))}
            onRequest={() => void runMutation(() => requestArenaCrewJoin(crew.id))}
            onLeave={() => void runMutation(() => leaveArenaCrew(crew.id))}
            onFollow={() => void runMutation(() => followArenaCrew(crew.id))}
            onUnfollow={() => void runMutation(() => unfollowArenaCrew(crew.id))}
          />

          {notice ? <Text style={[styles.notice, { color: t.textSecondary }]}>{notice}</Text> : null}

          <View style={[styles.panel, { borderColor: t.border }]}>
            <Text style={[styles.panelTitle, { color: t.textPrimary }]}>Activity</Text>
            <Text style={[styles.bio, { color: t.textMuted }]}>
              Crews are membership and identity in this phase. Shared posting, Crew challenges, and
              member moderation UIs are not wired yet — they stay deferred until product enables
              those RPCs in the client.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  header: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  crest: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestText: { ...typeScale.title, fontWeight: '700' },
  name: { ...typeScale.title },
  meta: { ...typeScale.caption },
  bio: { ...typeScale.body },
  notice: { ...typeScale.caption },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    marginTop: space.md,
  },
  panelTitle: { ...typeScale.label, fontWeight: '700' },
});
