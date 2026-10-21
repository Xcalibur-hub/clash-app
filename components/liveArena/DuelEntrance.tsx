/**
 * Short fighter-intro when entering a canonical Duel Room.
 * Event-driven, one-shot — never replays on hydration, keyboard, or transcript.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelEntranceDurationMs } from '../../utils/challengePresentation';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { hasPlayed, shouldPlayOnce } from '../../utils/motionOnce';

export interface DuelEntranceProps {
  duel: ArenaDuel;
  proposition: string;
  active: boolean;
  momentKey: string;
  onDone: () => void;
}

export function DuelEntrance({
  duel,
  proposition,
  active,
  momentKey,
  onDone,
}: DuelEntranceProps): React.JSX.Element | null {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const doneRef = React.useRef(false);
  const callback = React.useRef(onDone);
  callback.current = onDone;
  const claimed = React.useRef(false);
  const visible = active && (claimed.current || !hasPlayed(momentKey));

  React.useEffect(() => {
    if (!visible) return undefined;
    // Runs only after the visible overlay has committed — not in loading/error gates.
    if (!claimed.current) {
      if (!shouldPlayOnce(momentKey)) return undefined;
      claimed.current = true;
    }
    const ms = duelEntranceDurationMs(Boolean(reduced));
    const id = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      callback.current();
    }, ms);
    return () => clearTimeout(id);
  }, [visible, momentKey, reduced]);

  if (!visible) return null;

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    callback.current();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip Clash intro"
      accessibilityHint="Dismisses the intro and enters the Stage"
      onPress={finish}
      style={[
        styles.root,
        {
          backgroundColor: t.background,
          paddingTop: Math.max(insets.top, space.md),
          paddingBottom: Math.max(insets.bottom, space.md),
        },
      ]}
    >
      <ArenaAtmosphere mood="live" energy={0.35} />
      <View style={styles.content}>
        <Animated.Text
          entering={reduced ? undefined : FadeIn.duration(180)}
          style={[styles.kicker, { color: t.textMuted }]}
        >
          LIVE DUEL
        </Animated.Text>
        <Animated.Text
          entering={reduced ? undefined : FadeIn.duration(200)}
          numberOfLines={3}
          style={[styles.prop, { color: t.textPrimary }]}
        >
          {proposition}
        </Animated.Text>
        <View style={styles.row}>
          <Animated.View
            entering={reduced ? undefined : SlideInLeft.springify().damping(16)}
            style={styles.col}
          >
            <Avatar name={duel.fighterA.name} tint={duel.fighterA.tint ?? t.textMuted} size={64} />
            <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
              {duel.fighterA.name}
            </Text>
            <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
              @{duel.fighterA.handle}
            </Text>
          </Animated.View>
          <Animated.Text
            entering={reduced ? undefined : ZoomIn.delay(80).springify().damping(14)}
            style={[styles.vs, { color: t.textMuted }]}
          >
            VS
          </Animated.Text>
          <Animated.View
            entering={reduced ? undefined : SlideInRight.springify().damping(16)}
            style={styles.col}
          >
            <Avatar name={duel.fighterB.name} tint={duel.fighterB.tint ?? t.textMuted} size={64} />
            <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
              {duel.fighterB.name}
            </Text>
            <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
              @{duel.fighterB.handle}
            </Text>
          </Animated.View>
        </View>
        <Animated.Text
          entering={reduced ? undefined : FadeInDown.delay(120).duration(220)}
          style={[styles.live, { color: t.textSecondary }]}
        >
          ENTERING ARENA
        </Animated.Text>
        <Text style={[styles.skip, { color: t.textMuted }]}>Tap anywhere to skip</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    justifyContent: 'center',
  },
  content: {
    zIndex: 1,
    paddingHorizontal: space.lg,
    gap: space.lg,
    alignItems: 'center',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  prop: {
    ...typeScale.title,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: space.md },
  col: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...typeScale.label, fontSize: 15, fontWeight: '700', textAlign: 'center', width: '100%' },
  handle: {
    ...typeScale.caption,
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
  },
  vs: { ...typeScale.caption, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 },
  live: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  skip: {
    ...typeScale.caption,
    fontSize: 12,
    marginTop: space.xs,
  },
});
