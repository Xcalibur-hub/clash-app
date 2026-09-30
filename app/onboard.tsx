import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  OnboardChallengeDemo,
  OnboardJudgeDemo,
  OnboardSayDemo,
} from '../components/onboarding/OnboardDemos';
import { ONBOARDING_STAGES } from '../data/onboarding';
import { markOnboarded, useClash } from '../store';
import { space, typeScale, useThemeColors } from '../theme';
import { Squiggle } from '../components/shared/Doodles';
import { tap as hapticTap } from '../utils/haptics';

/** First-launch product demo — SAY / CHALLENGE / JUDGE, then Arena (guest OK). */
export default function OnboardScreen(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { width } = useWindowDimensions();
  const [index, setIndex] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const last = index === ONBOARDING_STAGES.length - 1;

  const finish = React.useCallback((): void => {
    dispatch(markOnboarded());
    router.replace('/(tabs)');
  }, [dispatch, router]);

  const advance = (): void => {
    hapticTap();
    if (last) {
      finish();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(page, ONBOARDING_STAGES.length - 1)));
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.sm }]}>
      <View style={styles.topRow}>
        <Text style={[styles.brand, { color: t.textPrimary }]}>CLASH</Text>
        <Pressable
          onPress={() => {
            hapticTap();
            finish();
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip the introduction"
          hitSlop={8}
          style={styles.skip}
        >
          <Text style={[styles.skipText, { color: t.textMuted }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
        accessibilityLabel="Onboarding stages"
      >
        {ONBOARDING_STAGES.map((stage, stageIndex) => {
          const active = stageIndex === index;
          return (
            <View key={stage.key} style={[styles.page, { width }]}>
              <View style={styles.copy}>
                <Text style={[styles.headline, { color: t.textPrimary }]}>{stage.headline}</Text>
                {stageIndex === 0 ? (
                  <Squiggle size={88} opacity={0.2} color={t.textPrimary} style={styles.doodle} />
                ) : null}
                <Text style={[styles.support, { color: t.textSecondary }]}>{stage.support}</Text>
              </View>

              <View style={styles.demo} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}>
                {stage.key === 'say' ? <OnboardSayDemo active={active} /> : null}
                {stage.key === 'challenge' ? <OnboardChallengeDemo active={active} /> : null}
                {stage.key === 'judge' ? <OnboardJudgeDemo active={active} /> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.dots} accessibilityRole="tablist" accessibilityLabel="Onboarding progress">
          {ONBOARDING_STAGES.map((stage, dotIndex) => (
            <View
              key={stage.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: dotIndex === index }}
              style={[
                styles.dot,
                {
                  backgroundColor: dotIndex === index ? t.textPrimary : t.borderStrong,
                  width: dotIndex === index ? 20 : 6,
                },
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel={last ? 'Enter the Arena' : 'Next'}
          style={[styles.cta, { backgroundColor: t.clashFill }]}
        >
          <Text style={[styles.ctaText, { color: t.clashText }]}>
            {last ? 'ENTER THE ARENA' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  brand: {
    ...typeScale.label,
    fontSize: 15,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  skip: { paddingVertical: space.sm, paddingHorizontal: space.xs, minHeight: 44, justifyContent: 'center' },
  skipText: { ...typeScale.meta },
  pager: { flex: 1 },
  pagerContent: { alignItems: 'stretch' },
  page: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.md,
    justifyContent: 'flex-start',
    gap: space.lg,
  },
  copy: { gap: space.sm },
  headline: {
    ...typeScale.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.4,
  },
  doodle: { marginTop: -4 },
  support: {
    ...typeScale.body,
    fontSize: 17,
    lineHeight: 24,
  },
  demo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
  },
  footer: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  dot: { height: 6, borderRadius: 999 },
  cta: {
    minHeight: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...typeScale.button,
    letterSpacing: 0.6,
  },
});
