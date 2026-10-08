/**
 * Interactive Clash 2.1 — immersive judging stage.
 *
 * Distinct from Take detail. Server remains authoritative for judgement,
 * settlement, reputation, and Blind reveal. No fabricated live aggregates.
 */
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClashArguments } from '../../components/clash/interactive/ClashArguments';
import { ClashCountdown, countdownUrgency } from '../../components/clash/interactive/ClashCountdown';
import { ClashJudgeControls } from '../../components/clash/interactive/ClashJudgeControls';
import { ClashMatchup } from '../../components/clash/interactive/ClashMatchup';
import { ClashPersonalState } from '../../components/clash/interactive/ClashPersonalState';
import { ClashResultShare } from '../../components/clash/interactive/ClashResultShare';
import { ClashSkeleton } from '../../components/clash/interactive/ClashSkeleton';
import { VerdictReveal } from '../../components/clash/interactive/VerdictReveal';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlowButton } from '../../components/shared/GlowButton';
import { Notice } from '../../components/shared/Notice';
import { ArenaIcon, BackIcon, ShareIcon } from '../../components/shared/icons';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { analytics } from '../../services/analytics';
import { currentViewerProfileId } from '../../services/apiService';
import {
  fetchClashViewForTake,
  fetchReputationEvents,
  settleClash,
  submitJudgement,
  type ClashParticipant,
  type ClashView,
} from '../../services/clashEngineService';
import { errorText, SupabaseError } from '../../services/supabaseClient';
import {
  selectAuthor,
  selectCommentsForTake,
  showNotice,
  useClash,
  type Side,
  type User,
} from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { judge as hapticJudge, tap as hapticTap } from '../../utils/haptics';

const POLL_MS = 20_000;

function asUser(participant: ClashParticipant): User {
  return {
    id: participant.id,
    handle: participant.handle,
    name: participant.name,
    tint: participant.tint,
    hood: 'for-you',
    rank: 'Rookie',
    reputation: 0,
    coins: 0,
    clashes: 0,
    wins: 0,
    streak: 0,
    badges: [],
  };
}

function clashErrorMessage(error: unknown): string {
  if (error instanceof SupabaseError) {
    switch (error.code) {
      case '42501':
        return 'Sign in to judge.';
      case 'P0003':
        return 'This Clash is no longer open for judging.';
      case 'P0004':
        return 'Judging has closed.';
      case 'P0005':
        return "You can't judge your own Clash.";
      default:
        return 'Judgement didn’t go through.';
    }
  }
  return 'Judgement didn’t go through.';
}

export default function ClashScreen(): React.JSX.Element {
  const { takeId } = useLocalSearchParams<{ takeId: string | string[] }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { state, dispatch } = useClash();
  const { signedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const t = useThemeColors();

  const [view, setView] = React.useState<ClashView | null | undefined>(undefined);
  const [reputation, setReputation] = React.useState(0);
  const [coins, setCoins] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingSide, setPendingSide] = React.useState<Side | null>(null);
  const [selectedSide, setSelectedSide] = React.useState<Side | null>(null);
  const settlingRef = React.useRef(false);
  const openedRef = React.useRef(false);
  const verdictTracked = React.useRef<string | null>(null);

  const closesAt = view?.closesAt ?? 0;
  const roughNow = useClock(30_000);
  const urgency = closesAt ? countdownUrgency(closesAt, roughNow) : 'calm';
  const tickMs =
    urgency === 'critical' || urgency === 'final' ? 1_000 : urgency === 'urgent' ? 5_000 : 30_000;
  const now = useClock(tickMs);

  const take = state.takes.find((item) => item.id === id);
  const sideAMedia = take?.media ?? null;
  const sideBMedia = React.useMemo(() => {
    if (!view?.sideBMediaKind || !view.sideBMediaUrl) return null;
    return {
      kind: view.sideBMediaKind,
      caption: '',
      colors: ['#1C1917', '#44403C'] as [string, string],
      url: view.sideBMediaUrl,
    };
  }, [view?.sideBMediaKind, view?.sideBMediaUrl]);

  const argumentItems = React.useMemo(() => {
    const comments = selectCommentsForTake(state, id)
      .filter((c) => !c.parentId)
      .slice(0, 8);
    const revealed = Boolean(view && (view.mode !== 'BLIND' || view.revealed));
    const sideAId = revealed ? view?.sideA?.id : undefined;
    const sideBId = revealed ? view?.sideB?.id : undefined;
    return comments.map((comment) => {
      let side: Side | null = null;
      if (sideAId && comment.authorId === sideAId) side = 'A';
      else if (sideBId && comment.authorId === sideBId) side = 'B';
      return {
        comment,
        author: selectAuthor(state, comment.authorId),
        side,
      };
    });
  }, [state, id, view]);

  const load = React.useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const next = await fetchClashViewForTake(id);
      setView(next);
      if (!next) return;
      if (next.battleMode === 'DUEL' && next.roomId) return;
      if (!openedRef.current) {
        openedRef.current = true;
        analytics.track('clash_opened', {
          realm: 'arena',
          clash_mode: next.mode,
        });
      }
      if (next.verdict && verdictTracked.current !== next.clashId) {
        verdictTracked.current = next.clashId;
        analytics.track('clash_verdict_viewed', {
          realm: 'arena',
          clash_mode: next.mode,
        });
      }
      const me = await currentViewerProfileId();
      if (me) {
        const events = await fetchReputationEvents(me);
        const mine = events.filter((event) => event.clashId === next.clashId);
        setReputation(mine.reduce((sum, event) => sum + event.reputationDelta, 0));
        setCoins(mine.reduce((sum, event) => sum + event.coinsDelta, 0));
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
      const timer = setInterval(() => {
        void load();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  React.useEffect(() => {
    if (
      view &&
      view.battleMode !== 'DUEL' &&
      view.status === 'open' &&
      view.closesAt <= Date.now() &&
      !view.verdict &&
      !settlingRef.current
    ) {
      settlingRef.current = true;
      void (async () => {
        try {
          await settleClash(view.clashId);
        } catch {
          /* not due / no ballots */
        }
        await load();
        settlingRef.current = false;
      })();
    }
  }, [view, load, now]);

  const judge = async (side: Side): Promise<void> => {
    if (!view || busy || view.hasJudged) return;
    if (!requireAuth()) return;
    analytics.track('clash_judgement_started', {
      realm: 'arena',
      clash_mode: view.mode,
    });
    setSelectedSide(side);
    setPendingSide(side);
    hapticJudge();
    setBusy(true);
    try {
      await submitJudgement(view.clashId, side);
      analytics.track('clash_judgement_completed', {
        realm: 'arena',
        clash_mode: view.mode,
      });
      analytics.track('judgement_submitted', {
        realm: 'arena',
        clash_mode: view.mode,
      });
      setPendingSide(null);
      await load();
    } catch (e) {
      setSelectedSide(null);
      setPendingSide(null);
      dispatch(showNotice(clashErrorMessage(e)));
    } finally {
      setBusy(false);
    }
  };

  const leave = (): void => {
    hapticTap();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const shareOpen = (): void => {
    if (!view) return;
    hapticTap();
    const blindHidden = view.mode === 'BLIND' && !view.revealed;
    void Share.share({
      message: blindHidden
        ? 'Judge this Blind Clash on CLASH'
        : `Judge this Clash on CLASH — "${view.sideAText}"`,
    });
  };

  if (error && view === undefined) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={ArenaIcon}
          title="Couldn't load this Clash."
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void load()}
        />
        <GlowButton label="Back" onPress={leave} tone="glass" compact style={styles.fallbackBtn} />
      </View>
    );
  }

  if (view === undefined) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ClashSkeleton />
      </View>
    );
  }

  if (view === null) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={ArenaIcon}
          title="No Clash here yet"
          body="Pending Challenges stay on the Take. A duel starts after the author accepts."
          actionLabel="View Take"
          onAction={() => router.replace(`/take/${id}`)}
        />
      </View>
    );
  }

  if (view.battleMode === 'DUEL' && view.roomId) {
    return <Redirect href={`/arena/room/${view.roomId}`} />;
  }

  const settled = view.status === 'settled';
  const cancelled = view.status === 'cancelled';
  const closed = view.status === 'open' && view.closesAt <= now;
  const blind = view.mode === 'BLIND';
  const sideA = view.sideA ? asUser(view.sideA) : null;
  const sideB = view.sideB ? asUser(view.sideB) : null;
  const ballot = view.myBallot;
  const activeSelection = busy ? selectedSide : ballot;
  const canJudge =
    signedIn &&
    !busy &&
    !view.hasJudged &&
    !view.isParticipant &&
    view.status === 'open' &&
    !closed;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <LinearGradient
        colors={
          t.scheme === 'light'
            ? ['rgba(196,165,116,0.14)', 'rgba(126,154,168,0.10)', 'transparent']
            : ['rgba(196,165,116,0.12)', 'rgba(126,154,168,0.10)', 'transparent']
        }
        locations={[0, 0.42, 1]}
        style={styles.stageWash}
        pointerEvents="none"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.sm,
            paddingBottom: insets.bottom + space.xxl,
          },
        ]}
        accessibilityLabel={
          blind && !view.revealed
            ? 'Blind Clash. Participant identities hidden until judgement.'
            : blind
              ? 'Blind Clash'
              : 'Clash'
        }
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.headerBtn}
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textPrimary }]}>
              {blind ? 'Blind Clash' : 'Clash'}
            </Text>
            <Text allowFontScaling={false} style={[styles.subEyebrow, { color: t.textMuted }]}>
              Judgement
            </Text>
            <ClashCountdown
              closesAt={view.closesAt}
              now={now}
              settled={settled}
              cancelled={cancelled}
              compact
            />
          </View>
          <Pressable
            onPress={shareOpen}
            accessibilityRole="button"
            accessibilityLabel="Share this Clash"
            hitSlop={8}
            style={styles.headerBtn}
          >
            <ShareIcon size={20} color={t.textPrimary} />
          </Pressable>
        </View>

        <ClashMatchup
          sideAText={view.sideAText}
          sideBText={view.sideBText}
          sideA={sideA}
          sideB={sideB}
          sideAMedia={sideAMedia}
          sideBMedia={sideBMedia}
          selectedSide={activeSelection}
          myBallot={ballot}
          settled={settled}
          winnerSide={view.verdict?.winnerSide ?? null}
          canJudge={canJudge}
          pendingSide={pendingSide}
          onSelectSide={(s) => void judge(s)}
        />

        {settled && view.verdict ? (
          <>
            <VerdictReveal
              verdict={view.verdict}
              myBallot={ballot}
              reputationDelta={reputation}
              coinsDelta={coins}
            />
            <ClashResultShare
              sideAText={view.sideAText}
              sideBText={view.sideBText}
              verdict={view.verdict}
              myBallot={ballot}
              blindHidden={blind && !view.revealed}
            />
            <GlowButton
              label="Back to Arena"
              onPress={() => {
                hapticTap();
                router.replace('/(tabs)');
              }}
              tone="glass"
              style={styles.fallbackBtn}
            />
          </>
        ) : cancelled ? (
          <View style={[styles.noticeBox, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
            <Text allowFontScaling={false} style={[styles.noticeText, { color: t.textMuted }]}>
              No community verdict was reached for this Clash.
            </Text>
          </View>
        ) : closed ? (
          <View style={[styles.noticeBox, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
            <Text allowFontScaling={false} style={[styles.noticeText, { color: t.textMuted }]}>
              Judging closed · result pending…
            </Text>
          </View>
        ) : view.isParticipant ? (
          <View style={[styles.noticeBox, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
            <Text allowFontScaling={false} style={[styles.noticeText, { color: t.textMuted }]}>
              Participants can’t judge their own Clash.
            </Text>
          </View>
        ) : view.hasJudged && ballot ? (
          <ClashPersonalState side={ballot} />
        ) : !signedIn ? (
          <GlowButton
            label="Sign in to judge"
            tone="light"
            onPress={() => router.push('/auth')}
            style={styles.fallbackBtn}
          />
        ) : canJudge ? (
          <ClashJudgeControls
            sideAHandle={view.revealed ? view.sideA?.handle ?? null : null}
            sideBHandle={view.revealed ? view.sideB?.handle ?? null : null}
            busy={busy}
            pendingSide={pendingSide}
            onJudge={(s) => void judge(s)}
          />
        ) : null}

        <ClashArguments
          items={argumentItems}
          onMakeArgument={() => {
            hapticTap();
            router.push(`/take/${id}`);
          }}
        />

        {error ? (
          <Text allowFontScaling={false} style={[styles.inlineError, { color: t.textSecondary }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stageWash: {
    ...StyleSheet.absoluteFillObject,
    height: 320,
  },
  content: { paddingHorizontal: layout.screenX, gap: space.md + 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  titleBlock: { alignItems: 'center', gap: 2, flexShrink: 1, paddingHorizontal: space.sm },
  eyebrow: {
    ...typeScale.label,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontSize: 17,
  },
  subEyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  noticeBox: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { ...typeScale.meta, textAlign: 'center' },
  fallbackBtn: { alignSelf: 'stretch' },
  inlineError: { ...typeScale.caption, textAlign: 'center' },
});
