/**
 * Tinder-style deck for incoming Challenges (Take author).
 * Swipe right = ACCEPT, left = PASS. Accessible PASS/ACCEPT buttons always present.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { ArenaChallenge } from '../../utils/arenaChallengePayload';
import {
  challengeSwipeDecision,
  CHALLENGE_SWIPE_RATIO,
} from '../../utils/challengeSwipe';
import { layout, space, spring, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { PressableScale } from '../shared/PressableScale';
import { ArenaAtmosphere } from '../liveArena/ArenaAtmosphere';

export interface ChallengeSwipeDeckProps {
  challenges: readonly ArenaChallenge[];
  takeText: string;
  busy?: boolean;
  error?: string | null;
  onAccept: (challenge: ArenaChallenge) => Promise<void>;
  onPass: (challenge: ArenaChallenge) => Promise<void>;
}

export function ChallengeSwipeDeck({
  challenges,
  takeText,
  busy = false,
  error = null,
  onAccept,
  onPass,
}: ChallengeSwipeDeckProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - layout.screenX * 2, 420);
  const dragX = useSharedValue(0);
  const locked = useSharedValue(0);
  const crossed = useSharedValue(0);
  const working = React.useRef(false);
  const frontKey = challenges[0]?.id ?? '';

  React.useEffect(() => {
    dragX.value = 0;
    locked.value = 0;
    crossed.value = 0;
    working.current = false;
  }, [frontKey, crossed, dragX, locked]);

  const current = challenges[0] ?? null;
  const next = challenges[1] ?? null;

  const announce = React.useCallback((label: string) => {
    AccessibilityInfo.announceForAccessibility(label);
  }, []);

  const resetCard = React.useCallback(() => {
    dragX.value = withSpring(0, spring.settle);
    locked.value = 0;
    crossed.value = 0;
    working.current = false;
  }, [crossed, dragX, locked]);

  const flyAway = React.useCallback(
    (direction: 1 | -1, then: () => void) => {
      const fly = direction * (cardWidth * 1.35);
      dragX.value = withSpring(fly, { damping: 20, stiffness: 160, mass: 0.8 }, (done) => {
        if (done) runOnJS(then)();
      });
    },
    [cardWidth, dragX],
  );

  const commit = React.useCallback(
    async (decision: 'accept' | 'pass') => {
      if (!current || working.current || busy) return;
      working.current = true;
      locked.value = 1;
      hapticPress();
      announce(decision === 'accept' ? 'Accepting challenge' : 'Passing on challenge');
      try {
        if (decision === 'accept') await onAccept(current);
        else await onPass(current);
        // Parent removes the resolved challenge; effect resets transform.
        working.current = false;
        locked.value = 0;
        crossed.value = 0;
        dragX.value = 0;
      } catch {
        resetCard();
      }
    },
    [announce, busy, crossed, current, dragX, locked, onAccept, onPass, resetCard],
  );

  const onThreshold = React.useCallback(() => {
    hapticTap();
  }, []);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduced && !busy && Boolean(current))
        .activeOffsetX([-12, 12])
        .failOffsetY([-28, 28])
        .onUpdate((event) => {
          if (locked.value === 1) return;
          dragX.value = event.translationX;
          const progress = Math.abs(event.translationX) / (cardWidth * CHALLENGE_SWIPE_RATIO);
          if (progress >= 1 && crossed.value === 0) {
            crossed.value = 1;
            runOnJS(onThreshold)();
          } else if (progress < 0.85) {
            crossed.value = 0;
          }
        })
        .onEnd((event) => {
          if (locked.value === 1) return;
          const decision = challengeSwipeDecision(event.translationX, event.velocityX, cardWidth);
          if (decision === 'accept') {
            locked.value = 1;
            runOnJS(flyAway)(1, () => {
              void commit('accept');
            });
          } else if (decision === 'pass') {
            locked.value = 1;
            runOnJS(flyAway)(-1, () => {
              void commit('pass');
            });
          } else {
            dragX.value = withSpring(0, spring.settle);
            crossed.value = 0;
          }
        }),
    [busy, cardWidth, commit, crossed, current, dragX, flyAway, locked, onThreshold, reduced],
  );

  const frontStyle = useAnimatedStyle(() => {
    const x = dragX.value;
    const rotate = interpolate(x, [-cardWidth, 0, cardWidth], [-10, 0, 10], Extrapolation.CLAMP);
    const scale = interpolate(Math.abs(x), [0, cardWidth * 0.5], [1, 0.97], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: x }, { rotate: `${rotate}deg` }, { scale }],
    };
  });

  const acceptStamp = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [0, cardWidth * CHALLENGE_SWIPE_RATIO], [0, 1], Extrapolation.CLAMP),
  }));
  const passStamp = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-cardWidth * CHALLENGE_SWIPE_RATIO, 0], [1, 0], Extrapolation.CLAMP),
  }));

  if (!current) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>No pending Challenges</Text>
        <Text style={[styles.emptyBody, { color: t.textMuted }]}>
          New challengers will appear here one at a time.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} accessibilityLabel={`Incoming challenges, ${challenges.length} remaining`}>
      <View style={[styles.stage, { minHeight: 420 }]}>
        <ArenaAtmosphere mood="upcoming" energy={0.2} />
        {next ? (
          <View
            pointerEvents="none"
            style={[
              styles.card,
              styles.backCard,
              {
                width: cardWidth,
                backgroundColor: t.surfaceElevated,
                borderColor: t.border,
                transform: [{ scale: 0.94 }, { translateY: 14 }],
              },
            ]}
          />
        ) : null}

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.card,
              {
                width: cardWidth,
                backgroundColor: t.surfaceElevated,
                borderColor: t.borderStrong,
              },
              frontStyle,
            ]}
          >
            <Animated.View style={[styles.stamp, styles.stampAccept, acceptStamp]}>
              <Text style={[styles.stampText, { color: '#2F9E44' }]}>ACCEPT</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampPass, passStamp]}>
              <Text style={[styles.stampText, { color: t.danger }]}>PASS</Text>
            </Animated.View>

            <View style={styles.cardHead}>
              <Avatar name={current.challenger.name} tint={t.textMuted} size={56} />
              <View style={styles.identity}>
                <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                  {current.challenger.name}
                </Text>
                <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                  @{current.challenger.handle}
                </Text>
                <Text style={[styles.status, { color: t.textSecondary }]}>{current.status}</Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>ORIGINAL TAKE</Text>
            <Text numberOfLines={4} style={[styles.take, { color: t.textSecondary }]}>
              {takeText}
            </Text>

            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>COUNTER-POSITION</Text>
            <Text style={[styles.counter, { color: t.textPrimary }]}>{current.counterPosition}</Text>

            <Text style={[styles.hint, { color: t.textMuted }]}>
              Swipe right to accept · left to pass
            </Text>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.actions}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Pass on this challenge"
          disabled={busy}
          style={[styles.actionBtn, { borderColor: t.borderStrong }]}
          onPress={() => {
            if (working.current || busy) return;
            flyAway(-1, () => {
              void commit('pass');
            });
          }}
        >
          <Text style={[styles.actionLabel, { color: t.textPrimary }]}>PASS</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Accept this challenge"
          disabled={busy}
          style={[styles.actionBtn, { borderColor: t.borderStrong, backgroundColor: t.pill }]}
          onPress={() => {
            if (working.current || busy) return;
            flyAway(1, () => {
              void commit('accept');
            });
          }}
        >
          <Text style={[styles.actionLabel, { color: t.pillText }]}>ACCEPT</Text>
        </PressableScale>
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: t.textSecondary }]}>
          {error}
        </Text>
      ) : null}

      <Text style={[styles.progress, { color: t.textMuted }]}>
        1 of {challenges.length} pending
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingVertical: space.md },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 20,
    marginHorizontal: layout.screenX,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    zIndex: 2,
  },
  backCard: {
    position: 'absolute',
    zIndex: 1,
    height: 360,
    opacity: 0.7,
  },
  stamp: {
    position: 'absolute',
    top: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderRadius: 8,
    zIndex: 3,
  },
  stampAccept: { left: 16, borderColor: '#2F9E44', transform: [{ rotate: '-12deg' }] },
  stampPass: { right: 16, borderColor: '#E5484D', transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 16, fontWeight: '800', letterSpacing: 1.2 },
  cardHead: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typeScale.label, fontSize: 18, fontWeight: '700' },
  handle: { ...typeScale.caption, fontSize: 14 },
  status: { ...typeScale.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  sectionLabel: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginTop: space.xs,
  },
  take: { ...typeScale.body, fontSize: 15, lineHeight: 21 },
  counter: { ...typeScale.body, fontSize: 17, lineHeight: 24, fontWeight: '500' },
  hint: { ...typeScale.caption, fontSize: 12, marginTop: space.sm },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: layout.screenX,
  },
  actionBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...typeScale.label, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  error: {
    ...typeScale.body,
    fontSize: 14,
    paddingHorizontal: layout.screenX,
  },
  progress: {
    ...typeScale.caption,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyWrap: { padding: space.lg, gap: space.xs },
  emptyTitle: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  emptyBody: { ...typeScale.body, fontSize: 14, lineHeight: 20 },
});
