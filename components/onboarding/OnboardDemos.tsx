import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duel, duration, ease, space, spring, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/** Miniature Take card — rises in, then a subtle reaction pulse. */
export function OnboardSayDemo({ active }: { active: boolean }): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const enter = useSharedValue(0);
  const react = useSharedValue(0);

  React.useEffect(() => {
    if (!active) {
      enter.value = 0;
      react.value = 0;
      return;
    }
    if (reduced) {
      enter.value = 1;
      react.value = 1;
      return;
    }
    enter.value = withDelay(60, withSpring(1, spring.settle));
    react.value = withDelay(420, withSpring(1, spring.settle));
  }, [active, enter, react, reduced]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * 24 },
      { scale: 0.96 + enter.value * 0.04 },
      { rotate: `${(1 - enter.value) * -1.5}deg` },
    ],
  }));

  const reactStyle = useAnimatedStyle(() => ({
    opacity: react.value,
    transform: [{ translateY: (1 - react.value) * 8 }],
  }));

  return (
    <View style={styles.sayWrap}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            shadowColor: t.shadowColor,
            shadowOpacity: t.scheme === 'light' ? 0.1 : 0.25,
          },
          cardStyle,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.hood, { color: t.textMuted }]}>
          TECHTAKES
        </Text>
        <Text allowFontScaling style={[styles.take, { color: t.textPrimary }]}>
          “AI won't replace developers. Developers using AI will.”
        </Text>
        <Text allowFontScaling={false} style={[styles.metaText, { color: t.textMuted }]}>
          @maya · just now
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.reactRow,
          { backgroundColor: t.surfaceMuted, borderColor: t.border },
          reactStyle,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.reactText, { color: t.textSecondary }]}>
          12 people reacting · 3 ready to Clash
        </Text>
      </Animated.View>
    </View>
  );
}

/** Take splits into Side A / Side B. */
export function OnboardChallengeDemo({ active }: { active: boolean }): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    if (!active) {
      progress.value = 0;
      return;
    }
    progress.value = reduced ? 1 : withDelay(50, withSpring(1, spring.settle));
  }, [active, progress, reduced]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * -28 },
      { rotate: `${(1 - progress.value) * -2}deg` },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * 28 },
      { rotate: `${(1 - progress.value) * 2}deg` },
    ],
  }));

  const vsStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.75 + progress.value * 0.25 }],
  }));

  return (
    <View style={styles.duel}>
      <Animated.View
        style={[
          styles.side,
          { backgroundColor: duel.aSoft, borderColor: duel.aLine },
          leftStyle,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.sideLabel, { color: duel.a }]}>
          A
        </Text>
        <Text allowFontScaling style={[styles.sideBody, { color: t.textPrimary }]}>
          AI raises the floor — juniors ship what seniors used to.
        </Text>
      </Animated.View>

      <Animated.View style={[styles.vsChip, { backgroundColor: t.clashFill }, vsStyle]}>
        <Text allowFontScaling={false} style={[styles.vsText, { color: t.clashText }]}>
          VS
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.side,
          { backgroundColor: duel.bSoft, borderColor: duel.bLine },
          rightStyle,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.sideLabel, { color: duel.b }]}>
          B
        </Text>
        <Text allowFontScaling style={[styles.sideBody, { color: t.textPrimary }]}>
          Without fundamentals, AI just ships confident mistakes.
        </Text>
      </Animated.View>
    </View>
  );
}

/** Tap selects a side, then verdict resolves. */
export function OnboardJudgeDemo({ active }: { active: boolean }): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const pick = useSharedValue(0);
  const resolve = useSharedValue(0);
  const [selected, setSelected] = React.useState<'A' | 'B' | null>(null);
  const [pctA, setPctA] = React.useState(0);
  const [pctB, setPctB] = React.useState(0);
  const [resolved, setResolved] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      pick.value = 0;
      resolve.value = 0;
      setSelected(null);
      setPctA(0);
      setPctB(0);
      setResolved(false);
      return undefined;
    }

    if (reduced) {
      pick.value = 1;
      resolve.value = 1;
      setSelected('A');
      setPctA(64);
      setPctB(36);
      setResolved(true);
      return undefined;
    }

    // Auto-demo: highlight A, then resolve.
    const selectTimer = setTimeout(() => {
      setSelected('A');
      pick.value = withSpring(1, spring.press);
      hapticTap();
    }, 380);

    const resolveTimer = setTimeout(() => {
      setResolved(true);
      resolve.value = withTiming(1, { duration: duration.cinematic, easing: ease.out });
      const start = Date.now();
      let frame = 0;
      const tick = (): void => {
        const tNow = Math.min(1, (Date.now() - start) / 360);
        const eased = 1 - (1 - tNow) ** 3;
        setPctA(Math.round(64 * eased));
        setPctB(Math.round(36 * eased));
        if (tNow < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 780);

    return () => {
      clearTimeout(selectTimer);
      clearTimeout(resolveTimer);
    };
  }, [active, pick, resolve, reduced]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selected === 'A' ? 1 + pick.value * 0.02 : 1 }],
    opacity: selected === 'B' ? 0.55 : 1,
  }));

  const bStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selected === 'B' ? 1 + pick.value * 0.02 : 1 }],
    opacity: selected === 'A' ? 0.55 : 1,
  }));

  const verdictStyle = useAnimatedStyle(() => ({
    opacity: resolve.value,
    transform: [{ translateY: (1 - resolve.value) * 10 }],
  }));

  return (
    <View style={styles.judge}>
      <View style={styles.judgeChoices}>
        <Animated.View
          style={[
            styles.judgeSide,
            {
              backgroundColor: duel.aSoft,
              borderColor: selected === 'A' ? duel.a : duel.aLine,
            },
            aStyle,
          ]}
        >
          <Text allowFontScaling={false} style={[styles.sideLabel, { color: duel.a }]}>
            A
          </Text>
          <Text allowFontScaling={false} style={[styles.judgeHint, { color: t.textSecondary }]}>
            Tap to judge
          </Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.judgeSide,
            {
              backgroundColor: duel.bSoft,
              borderColor: selected === 'B' ? duel.b : duel.bLine,
            },
            bStyle,
          ]}
        >
          <Text allowFontScaling={false} style={[styles.sideLabel, { color: duel.b }]}>
            B
          </Text>
          <Text allowFontScaling={false} style={[styles.judgeHint, { color: t.textSecondary }]}>
            Tap to judge
          </Text>
        </Animated.View>
      </View>

      {resolved ? (
        <Animated.View style={[styles.verdict, verdictStyle]}>
          <View style={styles.bars}>
            <View style={styles.barCol}>
              <Text allowFontScaling={false} style={[styles.pct, { color: duel.a }]}>
                {pctA}%
              </Text>
              <View style={[styles.barTrack, { backgroundColor: t.surfaceMuted }]}>
                <View style={[styles.barFill, { width: `${Math.max(pctA, 4)}%`, backgroundColor: duel.a }]} />
              </View>
            </View>
            <View style={styles.barCol}>
              <Text allowFontScaling={false} style={[styles.pct, { color: duel.b }]}>
                {pctB}%
              </Text>
              <View style={[styles.barTrack, { backgroundColor: t.surfaceMuted }]}>
                <View style={[styles.barFill, { width: `${Math.max(pctB, 4)}%`, backgroundColor: duel.b }]} />
              </View>
            </View>
          </View>
          <Text allowFontScaling={false} style={[styles.verdictLabel, { color: t.textPrimary }]}>
            Side A holds up
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sayWrap: { width: '100%', maxWidth: 340, gap: space.sm, alignItems: 'center' },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    width: '100%',
  },
  hood: { ...typeScale.caption, letterSpacing: 0.8 },
  take: { ...typeScale.takeText, fontSize: 20, lineHeight: 27 },
  metaText: { ...typeScale.meta },
  reactRow: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reactText: { ...typeScale.meta, textAlign: 'center' },
  duel: {
    width: '100%',
    maxWidth: 360,
    gap: space.sm,
    alignItems: 'center',
  },
  side: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: space.md,
    gap: 6,
  },
  sideLabel: { ...typeScale.caption, fontWeight: '700', letterSpacing: 0.8 },
  sideBody: { ...typeScale.bodyStrong, fontSize: 15, lineHeight: 21 },
  vsChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    zIndex: 2,
  },
  vsText: { ...typeScale.caption, fontWeight: '700', letterSpacing: 1 },
  judge: { width: '100%', maxWidth: 340, gap: space.md },
  judgeChoices: { flexDirection: 'row', gap: space.sm },
  judgeSide: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: space.lg,
    alignItems: 'center',
    gap: 6,
  },
  judgeHint: { ...typeScale.meta, fontSize: 12 },
  verdict: { gap: space.sm },
  bars: { flexDirection: 'row', gap: space.md },
  barCol: { flex: 1, gap: 8, alignItems: 'center' },
  pct: { ...typeScale.title, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
  barTrack: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: { height: 7, borderRadius: 999 },
  verdictLabel: { ...typeScale.label, textAlign: 'center', fontWeight: '600' },
});
