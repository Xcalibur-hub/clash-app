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
  resolveClashAction,
  selectAuthor,
  selectClashForTake,
  selectJudgement,
  selectResult,
  selectTopComment,
  useClash,
  type Judgement,
} from '../../store';
import { duration, space } from '../../theme';
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

  const [stage, setStage] = React.useState<ClashStage>(storedResult ? 'result' : 'battle');
  const [judgement, setJudgement] = React.useState<Judgement | undefined>(
    clash ? selectJudgement(state, clash.id) : undefined,
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Next Clash" replaces the route, which can reuse this instance — re-derive
  // the stage from the fresh param so a stale verdict never blocks the ballot.
  // Keyed on the route param only: later dispatches (the resolve action) must
  // not rewind the recorded → reveal beat that this effect would otherwise reset.
  React.useEffect(() => {
    const target = state.takes.find((item) => item.id === takeId);
    const targetClash = target ? selectClashForTake(state, target.id) : undefined;
    setJudgement(targetClash ? selectJudgement(state, targetClash.id) : undefined);
    setStage(targetClash && selectResult(state, targetClash.id) ? 'result' : 'battle');
  }, [takeId]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const leave = React.useCallback((): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  const choose = (choice: Judgement): void => {
    if (!clash || stage !== 'battle') return;
    hapticJudge();
    const result = resolveClash({
      clash,
      judgement: choice,
      viewerReputation: state.viewer.reputation,
    });
    setJudgement(choice);
    setStage('recorded');
    dispatch(resolveClashAction(clash.id, choice, result));
    // The ballot is sealed; the jury tally stays hidden for one tight beat (§10).
    timer.current = setTimeout(() => {
      notify(
        result.alignment === 'majority'
          ? 'success'
          : result.alignment === 'minority'
            ? 'warning'
            : 'error',
      );
      setStage('result');
    }, duration.reveal);
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
        judgement={judgement}
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