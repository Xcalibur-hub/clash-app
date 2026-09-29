import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MindshiftPanel } from '../../components/arena/MindshiftPanel';
import { ClashResultView } from '../../components/clash/ClashResultView';
import { ClashSide as ClashSideView } from '../../components/clash/ClashSide';
import { ClashStatus, type ClashStatusKind } from '../../components/clash/ClashStatus';
import { JudgementPanel, LockedJudgement } from '../../components/clash/JudgementPanel';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlowButton } from '../../components/shared/GlowButton';
import { Notice } from '../../components/shared/Notice';
import { ArenaIcon, BackIcon, ShareIcon } from '../../components/shared/icons';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
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
import { showNotice, useClash, type Side, type User } from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { color, ink, space, typeScale } from '../../theme';
import { judge as hapticJudge, tap as hapticTap } from '../../utils/haptics';

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
      case '42501': return 'Sign in to judge.';
      case 'P0003': return 'This Clash is no longer open for judging.';
      case 'P0004': return 'Judging has closed.';
      case 'P0005': return "You can't judge your own Clash.";
      default: return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

/** THE CLASH — standard or blind, identities only when the server reveals them. */
export default function ClashScreen(): React.JSX.Element {
  const { takeId } = useLocalSearchParams<{ takeId: string | string[] }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { dispatch } = useClash();
  const { signedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const now = useClock(30_000);

  const [view, setView] = React.useState<ClashView | null | undefined>(undefined);
  const [reputation, setReputation] = React.useState(0);
  const [coins, setCoins] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const settlingRef = React.useRef(false);

  const load = React.useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const next = await fetchClashViewForTake(id);
      setView(next);
      if (!next) return;
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

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (view && view.status === 'open' && view.closesAt <= Date.now() && !view.verdict && !settlingRef.current) {
      settlingRef.current = true;
      void (async () => {
        try {
          await settleClash(view.clashId);
        } catch {
          /* no ballots / not due — ignore */
        }
        await load();
        settlingRef.current = false;
      })();
    }
  }, [view, load]);

  const judge = async (side: Side): Promise<void> => {
    if (!view || busy || view.hasJudged) return;
    if (!requireAuth()) return;
    hapticJudge();
    setBusy(true);
    try {
      await submitJudgement(view.clashId, side);
      await load();
    } catch (e) {
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

  const share = (): void => {
    if (!view) return;
    const blindHidden = view.mode === 'BLIND' && !view.revealed;
    void Share.share({
      message: blindHidden ? 'Judge this Blind Clash on CLASH' : `Judge this Clash on CLASH — "${view.sideAText}"`,
    });
  };

  if (error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <EmptyState icon={ArenaIcon} title="Couldn't load this Clash" body={error} actionLabel="BACK" onAction={leave} />
      </View>
    );
  }

  if (view === undefined) {
    return <View style={styles.root}><Text style={styles.loading}>Loading…</Text></View>;
  }

  if (view === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <EmptyState icon={ArenaIcon} title="No Clash here yet" body="A Clash starts when someone challenges this Take with a rebuttal." actionLabel="VIEW TAKE" onAction={() => router.replace(`/take/${id}`)} />
      </View>
    );
  }

  const settled = view.status === 'settled';
  const cancelled = view.status === 'cancelled';
  const closed = view.status === 'open' && view.closesAt <= now;
  const statusKind: ClashStatusKind = settled ? 'settled' : cancelled ? 'cancelled' : closed ? 'closed' : 'open';
  const blind = view.mode === 'BLIND';
  const sideA = view.sideA ? asUser(view.sideA) : null;
  const sideB = view.sideB ? asUser(view.sideB) : null;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
        accessibilityLabel={
          blind && !view.revealed
            ? 'Blind Clash. Side A. Side B. Participant identities hidden until judgement.'
            : blind
              ? 'Blind Clash'
              : 'Clash'
        }
      >
        <View style={styles.topRow}>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.headerBtn}>
            <BackIcon size={20} color={ink.primary} />
          </Pressable>
          <Text allowFontScaling={false} style={styles.eyebrow}>{blind ? 'BLIND CLASH' : 'CLASH'}</Text>
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share this Clash" hitSlop={8} style={styles.headerBtn}>
            <ShareIcon size={20} color={ink.primary} />
          </Pressable>
        </View>

        <ClashStatus kind={statusKind} closesAt={view.closesAt} now={now} />

        <ClashSideView
          side="A"
          author={sideA}
          text={view.sideAText}
          winner={settled && view.verdict?.winnerSide === 'A'}
          faded={settled && view.verdict?.winnerSide === 'B'}
          enterDelay={0}
        />
        <View style={styles.vsRow}>
          <View style={styles.vsLine} />
          <Text allowFontScaling={false} style={styles.vsText}>VS</Text>
          <View style={styles.vsLine} />
        </View>
        <ClashSideView
          side="B"
          author={sideB}
          text={view.sideBText || '[rebuttal unavailable]'}
          winner={settled && view.verdict?.winnerSide === 'B'}
          faded={settled && view.verdict?.winnerSide === 'A'}
          enterDelay={120}
        />

        <MindshiftPanel takeId={view.takeId} offerFinal={view.hasJudged || settled} />

        {settled && view.verdict ? (
          <ClashResultView verdict={view.verdict} reputationDelta={reputation} coinsDelta={coins} />
        ) : cancelled ? (
          <View style={styles.noticeBox}><Text style={styles.noticeText}>No community verdict was reached for this Clash.</Text></View>
        ) : closed ? (
          <View style={styles.noticeBox}><Text style={styles.noticeText}>Judging closed · result pending…</Text></View>
        ) : view.isParticipant ? (
          <View style={styles.noticeBox}><Text style={styles.noticeText}>Participants can't judge their own Clash.</Text></View>
        ) : view.hasJudged && view.myBallot ? (
          <LockedJudgement side={view.myBallot} />
        ) : !signedIn ? (
          <GlowButton label="Sign in to judge" tone="light" onPress={() => router.push('/auth')} style={styles.guestCta} />
        ) : (
          <JudgementPanel
            sideAHandle={view.revealed ? view.sideA?.handle ?? null : null}
            sideBHandle={view.revealed ? view.sideB?.handle ?? null : null}
            busy={busy}
            onJudge={(s) => void judge(s)}
          />
        )}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.md, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  eyebrow: { ...typeScale.caption, color: ink.primary, fontWeight: '800', letterSpacing: 1.2 },
  loading: { ...typeScale.meta, color: ink.tertiary, paddingTop: 200, textAlign: 'center' },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
  vsLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' },
  vsText: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 2, fontWeight: '800', fontSize: 11 },
  noticeBox: { padding: space.md, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)' },
  noticeText: { ...typeScale.meta, color: ink.tertiary },
  guestCta: { alignSelf: 'stretch' },
});
