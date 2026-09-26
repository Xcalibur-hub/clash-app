import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClashBody, type ClashStage } from '../../components/clash/ClashBody';
import { clashStyles as s } from '../../components/clash/clashStyles';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { ShieldIcon } from '../../components/shared/icons';
import { resolveClash } from '../../services/clashService';
import {
  recordBallot,
  selectAuthor,
  selectClashForTake,
  selectJudgement,
  selectResult,
  selectTopComment,
  settleClash,
  useClash,
  type Judgement,
} from '../../store';
import { space } from '../../theme';
import { useClock } from '../../hooks/useClock';
import { judge as hapticJudge, notify, tap as hapticTap } from '../../utils/haptics';

/** THE CLASH (PRD §9–§11) — the hero screen: decide in seconds, then loop. */
export default function ClashScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ takeId: string }>();
  const takeId = typeof params.takeId === 'string' ? params.takeId : '';
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const take = state.takes.find((item) => item.id === takeId);
  const clash = take ? selectClashForTake(state, take.id) : undefined;
  const author = take ? selectAuthor(state, take.authorId) : undefined;
  const topComment = take ? selectTopComment(state, take.id) : undefined;
  const topAuthor = topComment ? selectAuthor(state, topComment.authorId) : undefined;
  const challenger = topAuthor ?? (clash ? selectAuthor(state, clash.challengerId) : undefined);
  const challengerText = topComment?.text ?? clash?.challengerText ?? '';
  const storedResult = clash ? selectResult(state, clash.id) : undefined;
  const ballot = clash ? selectJudgement(state, clash.id) : undefined;
  const live = take ? take.expiresAt > Date.now() : false;
  const now = useClock();

  // The stage is fully derived from the store: a settled clash reveals, a
  // recorded ballot locks and counts down to the drop, and a live debate
  // accepts one ballot. Replacing the route ("Next Clash") re-derives
  // automatically, so no stale verdict ever blocks a fresh ballot.
  const stage: ClashStage = storedResult ? 'result' : ballot ? 'locked' : 'battle';

  const settle = React.useCallback((): void => {
    if (!clash || state.results[clash.id]) return;
    const finalJudgement: Judgement = selectJudgement(state, clash.id) ?? 'UNDECIDED';
    const result = resolveClash({
      clash,
      judgement: finalJudgement,
      viewerReputation: state.viewer.reputation,
    });
    notify(
      result.alignment === 'majority'
        ? 'success'
        : result.alignment === 'minority'
          ? 'warning'
          : 'error',
    );
    dispatch(settleClash(result));
  }, [clash, dispatch, state]);

  // The final judgement lands when the clock runs out: an expired clash settles
  // on first view, and a live one settles the moment the countdown ends.
  React.useEffect(() => {
    if (!take || !clash || storedResult) return undefined;
    const msLeft = take.expiresAt - Date.now();
    if (msLeft <= 0) {
      settle();
      return undefined;
    }
    const timer = setTimeout(settle, msLeft + 250);
    return () => clearTimeout(timer);
  }, [clash, settle, storedResult, take]);

  const leave = React.useCallback((): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  const choose = (choice: Judgement): void => {
    if (!clash || !live || stage !== 'battle') return;
    hapticJudge();
    // The ballot is recorded; the jury files the verdict at the end of the day.
    dispatch(recordBallot(clash.id, choice));
  };

  /** The retention loop (§11): jump straight into the next open clash. */
  const nextClash = React.useCallback((): void => {
    hapticTap();
    const next = state.clashes.find((item) => {
      if (item.takeId === takeId || selectResult(state, item.id)) return false;
      const target = state.takes.find((entry) => entry.id === item.takeId);
      return target !== undefined && target.expiresAt > Date.now();
    });
    router.replace(next ? `/clash/${next.takeId}` : '/(tabs)');
  }, [router, state, takeId]);

  if (!take || !clash || !author || !challenger) {
    return (
      <View style={[s.root, s.errorWrap, { paddingTop: insets.top }]}>
        <EmptyState
          icon={ShieldIcon}
          title="This clash has closed."
          body="Takes only survive 24 hours. Head back to the Arena for whatever is live right now."
          actionLabel="BACK TO ARENA"
          onAction={leave}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ClashBody
        take={take}
        author={author}
        challenger={challenger}
        challengerText={challengerText}
        clash={clash}
        storedResult={storedResult}
        revealed={stage === 'result' && Boolean(storedResult)}
        stage={stage}
        judgement={ballot}
        challengerIsCommunity={topComment != null}
        expiresAt={take.expiresAt}
        now={now}
        paddingTop={insets.top + space.sm}
        paddingBottom={insets.bottom + space.xxl}
        onChoose={choose}
        onLeave={leave}
        onDone={() => router.replace('/(tabs)')}
        onNextClash={nextClash}
      />
      <Notice offset={0} />
    </View>
  );
}