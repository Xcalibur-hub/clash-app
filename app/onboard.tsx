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
import { ONBOARDING_SLIDES } from '../data/onboarding';
import { OnboardSlide } from '../components/onboarding/OnboardSlide';
import { AuroraBackground } from '../components/shared/AuroraBackground';
import { GlowButton } from '../components/shared/GlowButton';
import { markOnboarded, useClash } from '../store';
import { accent, ink, radius, space, typeScale } from '../theme';
import { tap as hapticTap } from '../utils/haptics';

/** First-launch sequence (spec §5). Three beats, then straight into the Arena. */
export default function OnboardScreen(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);

  const finish = React.useCallback((): void => {
    dispatch(markOnboarded());
    router.replace('/(tabs)');
  }, [dispatch, router]);

  const advance = (): void => {
    if (index === ONBOARDING_SLIDES.length - 1) {
      finish();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(page, ONBOARDING_SLIDES.length - 1)));
  };

  return (
    <AuroraBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.topRow}>
          <Text allowFontScaling={false} style={styles.brand}>
            CLASH
          </Text>
          <Pressable
            onPress={() => {
              hapticTap();
              finish();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip the introduction"
            style={styles.skip}
          >
            <Text allowFontScaling={false} style={styles.skipText}>
              SKIP
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.pager}
        >
          {ONBOARDING_SLIDES.map((slide) => (
            <View key={slide.key} style={[styles.page, { width }]}>
              <OnboardSlide
                icon={slide.icon}
                step={slide.step}
                title={slide.title}
                body={slide.body}
                tone={slide.tone}
              />
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.dots}>
            {ONBOARDING_SLIDES.map((slide, dotIndex) => (
              <View
                key={slide.key}
                style={[styles.dot, dotIndex === index ? styles.dotOn : null]}
              />
            ))}
          </View>
          <GlowButton
            label={index === ONBOARDING_SLIDES.length - 1 ? 'GET STARTED' : 'NEXT'}
            tone={index === ONBOARDING_SLIDES.length - 1 ? 'gold' : 'a'}
            onPress={advance}
          />
        </View>
      </View>
    </AuroraBackground>
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
  brand: { ...typeScale.title, letterSpacing: 3, color: ink.primary },
  skip: { padding: space.sm },
  skipText: { ...typeScale.caption, color: ink.tertiary },
  pager: { flexGrow: 0, marginTop: space.xxl },
  page: { paddingHorizontal: space.xl, justifyContent: 'center' },
  footer: { marginTop: 'auto', paddingHorizontal: space.xl, gap: space.lg },
  dots: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dotOn: { width: 22, backgroundColor: accent.a },
});
