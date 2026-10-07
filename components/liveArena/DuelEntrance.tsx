/**
 * Short fighter-intro when entering a canonical Duel Room (~500–900ms).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { ArenaAtmosphere } from './ArenaAtmosphere';

export interface DuelEntranceProps {
  duel: ArenaDuel;
  proposition: string;
  active: boolean;
  onDone: () => void;
}

export function DuelEntrance({
  duel,
  proposition,
  active,
  onDone,
}: DuelEntranceProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!active) return undefined;
    doneRef.current = false;
    const ms = reduced ? 180 : 720;
    const id = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, ms);
    return () => clearTimeout(id);
  }, [active, onDone, reduced]);

  if (!active) return null;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]} pointerEvents="auto">
      <ArenaAtmosphere mood="live" energy={0.4} />
      <View style={styles.content}>
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
          </Animated.View>
        </View>
        <Animated.Text
          entering={reduced ? undefined : FadeInDown.delay(120).duration(220)}
          style={[styles.live, { color: t.textSecondary }]}
        >
          ENTERING ARENA
        </Animated.Text>
      </View>
    </View>
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
    gap: space.xl,
    alignItems: 'center',
  },
  prop: {
    ...typeScale.title,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: space.md },
  col: { flex: 1, alignItems: 'center', gap: 8, minWidth: 0 },
  name: { ...typeScale.label, fontSize: 15, fontWeight: '700', textAlign: 'center', width: '100%' },
  vs: { ...typeScale.caption, fontSize: 13, fontWeight: '700', letterSpacing: 1.4 },
  live: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
});
