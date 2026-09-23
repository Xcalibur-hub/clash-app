import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClashBody, type ClashStage } from '../../components/clash/ClashBody';
import { clashStyles as s } from '../../components/clash/clashStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
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
  useClash,
  type Judgement,
} from '../../store';
import { duration, space } from '../../theme';
import { notify, tap as hapticTap } from '../../utils/haptics';

/** THE CLASH (spec §8–§10) — the hero screen of the product. */
export default function ClashScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ takeId: string }>();
  const takeId = typeof params.takeId === 'string' ? params.takeId : '';
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const take = state.takes.find((item) => item.id === takeId);
  const clash = take ? selectClashForTake(state, take.id) : undefined;
  const author = take ? selectAuthor(state, take.authorId) : undefined;
  const challenger = clash ? selectAuthor(state, clash.challengerId) : undefined;
  const storedResult = clash ? selectResult(state, clash.id) : undefined;

  const [stage, setStage] = React.useState<ClashStage>(storedResult ? 'result' : 'battle');
  const [judgement, setJudgement] = React.useState<Judgement | undefined>(
    clash ? selectJudgement(state, clash.id) : undefined,
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const result = resolveClash({
      clash,
      judgement: choice,
      viewerReputation: state.viewer.reputation,
    });
    setJudgement(choice);
    setStage('recorded');
    dispatch(resolveClashAction(clash.id, choice, result));
    // Suspense beat: the jury tally stays sealed for a moment (spec §8).
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

  if (!take || !clash || !author || !challenger) {
    return (
      <AuroraBackground>
        <View style={[s.errorWrap, { paddingTop: insets.top }]}>
          <EmptyState
            icon={ShieldIcon}
            title="This clash has closed."
            body="Takes only survive 24 hours. Head back to the Arena for whatever is live right now."
            actionLabel="BACK TO ARENA"
            onAction={leave}
          />
        </View>
      </AuroraBackground>
    );
  }

  return (
    <AuroraBackground tone="duel" doodles={false}>
      <ClashBody
        take={take}
        author={author}
        challenger={challenger}
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
      />
      <Notice offset={0} />
    </AuroraBackground>
  );
}
