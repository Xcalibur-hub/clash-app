/**
 * True full-screen incoming Challenge deck for Take authors.
 * Occupies the entire viewport — not an embedded feed card.
 */
import React from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { space, spring, typeScale, useThemeColors } from '../../theme';
import { judge as hapticJudge, press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { CloseIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { ArenaAtmosphere } from '../liveArena/ArenaAtmosphere';

export interface FullScreenChallengeDeckProps {
  visible: boolean;
  challenges: readonly ArenaChallenge[];
  takeText: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onAccept: (challenge: ArenaChallenge) => Promise<void>;
  onPass: (challenge: ArenaChallenge) => Promise<void>;
}

export function FullScreenChallengeDeck({
  visible,
  challenges,
  takeText,
  busy = false,
  error = null,
  onClose,
  onAccept,
  onPass,
}: FullScreenChallengeDeckProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
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
  const remaining = challenges.length;

  const surfaceH = Math.max(420, height - insets.top - insets.bottom - 148);
  const surfaceW = width - 28;

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
      dragX.value = withSpring(direction * (width * 1.2), { damping: 20, stiffness: 170, mass: 0.75 }, (done) => {
        if (done) runOnJS(then)();
      });
    },
    [dragX, width],
  );

  const commit = React.useCallback(
    async (decision: 'accept' | 'pass') => {
      if (!current || working.current || busy) return;
      working.current = true;
      locked.value = 1;
      if (decision === 'accept') hapticJudge();
      else hapticPress();
      announce(decision === 'accept' ? 'Accepting challenge' : 'Passing on challenge');
      try {
        if (decision === 'accept') await onAccept(current);
        else await onPass(current);
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
        .enabled(!reduced && !busy && Boolean(current) && visible)
        .activeOffsetX([-14, 14])
        .failOffsetY([-36, 36])
        .onUpdate((event) => {
          if (locked.value === 1) return;
          dragX.value = event.translationX;
          const progress = Math.abs(event.translationX) / (width * CHALLENGE_SWIPE_RATIO);
          if (progress >= 1 && crossed.value === 0) {
            crossed.value = 1;
            runOnJS(onThreshold)();
          } else if (progress < 0.85) {
            crossed.value = 0;
          }
        })
        .onEnd((event) => {
          if (locked.value === 1) return;
          const decision = challengeSwipeDecision(event.translationX, event.velocityX, width);
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
    [busy, commit, crossed, current, dragX, flyAway, locked, onThreshold, reduced, visible, width],
  );

  const frontStyle = useAnimatedStyle(() => {
    const x = dragX.value;
    const rotate = interpolate(x, [-width, 0, width], [-8, 0, 8], Extrapolation.CLAMP);
    const scale = interpolate(Math.abs(x), [0, width * 0.4], [1, 0.985], Extrapolation.CLAMP);
    return { transform: [{ translateX: x }, { rotate: `${rotate}deg` }, { scale }] };
  });

  const nextStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(dragX.value) / (width * CHALLENGE_SWIPE_RATIO));
    return {
      opacity: 0.55 + p * 0.45,
      transform: [{ scale: 0.96 + p * 0.04 }, { translateY: 10 - p * 10 }],
    };
  });

  const acceptCue = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [0, width * CHALLENGE_SWIPE_RATIO], [0, 1], Extrapolation.CLAMP),
  }));
  const passCue = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-width * CHALLENGE_SWIPE_RATIO, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const atmosphereEnergy = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragX.value), [0, width * 0.4], [0.85, 1], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: t.background }]} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, atmosphereEnergy]}>
          <ArenaAtmosphere mood="upcoming" energy={0.32} />
        </Animated.View>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close challenges"
            onPress={onClose}
            hitSlop={10}
            style={styles.closeHit}
          >
            <CloseIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
          </Pressable>
          <Text style={[styles.topTitle, { color: t.textPrimary }]}>CHALLENGE</Text>
          <Text style={[styles.pending, { color: t.textMuted }]}>
            {remaining} PENDING
          </Text>
        </View>

        <View style={styles.stage}>
          {current ? (
            <>
              {next ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.surface,
                    styles.nextSurface,
                    {
                      width: surfaceW,
                      height: surfaceH,
                      backgroundColor: t.surfaceElevated,
                      borderColor: t.border,
                    },
                    nextStyle,
                  ]}
                />
              ) : null}

              <GestureDetector gesture={pan}>
                <Animated.View
                  style={[
                    styles.surface,
                    {
                      width: surfaceW,
                      height: surfaceH,
                      backgroundColor: t.surfaceElevated,
                      borderColor: t.borderStrong,
                    },
                    frontStyle,
                  ]}
                >
                  <Animated.View style={[styles.cue, styles.cueAccept, acceptCue]}>
                    <Text style={[styles.cueText, { color: t.textPrimary }]}>ACCEPT →</Text>
                  </Animated.View>
                  <Animated.View style={[styles.cue, styles.cuePass, passCue]}>
                    <Text style={[styles.cueText, { color: t.textPrimary }]}>← PASS</Text>
                  </Animated.View>

                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    <View style={styles.challenger}>
                      <Avatar name={current.challenger.name} tint={t.textMuted} size={72} />
                      <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                        {current.challenger.name}
                      </Text>
                      <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                        @{current.challenger.handle}
                      </Text>
                      <Text style={[styles.challenged, { color: t.textSecondary }]}>CHALLENGED YOU</Text>
                    </View>

                    <Text style={[styles.section, { color: t.textMuted }]}>YOUR TAKE</Text>
                    <Text style={[styles.take, { color: t.textSecondary }]}>{takeText}</Text>

                    <View style={styles.vsRow}>
                      <View style={[styles.vsLine, { backgroundColor: t.border }]} />
                      <Text style={[styles.vs, { color: t.textMuted }]}>VS</Text>
                      <View style={[styles.vsLine, { backgroundColor: t.border }]} />
                    </View>

                    <Text style={[styles.section, { color: t.textMuted }]}>THEIR TAKE</Text>
                    <Text style={[styles.counter, { color: t.textPrimary }]}>
                      {current.counterPosition}
                    </Text>

                    <Text style={[styles.hint, { color: t.textMuted }]}>
                      Swipe right to accept · left to pass
                    </Text>
                  </ScrollView>
                </Animated.View>
              </GestureDetector>
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>No pending Challenges</Text>
              <Text style={[styles.emptyBody, { color: t.textMuted }]}>
                You're caught up. New challengers will appear here.
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.actions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Pass on this challenge"
              disabled={busy || !current}
              style={[styles.actionBtn, { borderColor: t.borderStrong }]}
              onPress={() => {
                if (!current || working.current || busy) return;
                flyAway(-1, () => {
                  void commit('pass');
                });
              }}
            >
              <Text style={[styles.actionLabel, { color: t.textPrimary }]}>PASS</Text>
              <Text style={[styles.actionArrow, { color: t.textMuted }]}>←</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Accept this challenge"
              disabled={busy || !current}
              style={[styles.actionBtn, { borderColor: t.borderStrong, backgroundColor: t.pill }]}
              onPress={() => {
                if (!current || working.current || busy) return;
                flyAway(1, () => {
                  void commit('accept');
                });
              }}
            >
              <Text style={[styles.actionLabel, { color: t.pillText }]}>ACCEPT</Text>
              <Text style={[styles.actionArrow, { color: t.pillText }]}>→</Text>
            </PressableScale>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: t.textSecondary }]}>
              {error}
            </Text>
          ) : null}
          <Text style={[styles.progress, { color: t.textMuted }]}>
            {remaining > 0 ? `1 of ${remaining}` : '0 pending'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    zIndex: 2,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  closeHit: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  topTitle: {
    ...typeScale.label,
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  pending: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    minWidth: 72,
    textAlign: 'right',
  },
  stage: {
    flex: 1,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 2,
  },
  nextSurface: {
    position: 'absolute',
    zIndex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  challenger: { alignItems: 'center', gap: 4, marginBottom: space.sm },
  name: { ...typeScale.label, fontSize: 22, fontWeight: '700', maxWidth: '100%' },
  handle: { ...typeScale.caption, fontSize: 15 },
  challenged: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 6,
  },
  section: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: space.md,
  },
  take: { ...typeScale.body, fontSize: 16, lineHeight: 23 },
  counter: { ...typeScale.body, fontSize: 18, lineHeight: 26, fontWeight: '500' },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginVertical: space.md,
  },
  vsLine: { flex: 1, height: StyleSheet.hairlineWidth },
  vs: { ...typeScale.caption, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  hint: { ...typeScale.caption, fontSize: 12, textAlign: 'center', marginTop: space.lg },
  cue: {
    position: 'absolute',
    top: 20,
    zIndex: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  cueAccept: { right: 16 },
  cuePass: { left: 16 },
  cueText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  bottom: {
    zIndex: 2,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  actions: { flexDirection: 'row', gap: space.md },
  actionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionLabel: { ...typeScale.label, fontSize: 15, fontWeight: '800', letterSpacing: 0.9 },
  actionArrow: { fontSize: 14, fontWeight: '600' },
  error: { ...typeScale.body, fontSize: 14, textAlign: 'center' },
  progress: { ...typeScale.caption, fontSize: 12, textAlign: 'center', paddingBottom: 4 },
  empty: { padding: space.xl, gap: space.sm, alignItems: 'center' },
  emptyTitle: { ...typeScale.label, fontSize: 18, fontWeight: '700' },
  emptyBody: { ...typeScale.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
