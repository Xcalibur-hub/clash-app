/** One committed intro per canonical room visit; reduced motion stays static. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaPhase } from '../../services/liveArenaService';
import { duelEntranceDurationMs } from '../../utils/challengePresentation';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { hasPlayed, shouldPlayOnce } from '../../utils/motionOnce';

export interface DuelEntranceProps {
  duel: ArenaDuel; proposition: string; phase?: ArenaPhase;
  active: boolean; momentKey: string; onDone: () => void;
}
export function DuelEntrance({ duel, proposition, phase = 'open', active, momentKey, onDone }: DuelEntranceProps): React.JSX.Element | null {
  const t = useThemeColors(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const done = React.useRef(false), claimed = React.useRef(false), callback = React.useRef(onDone);
  callback.current = onDone;
  const visible = active && (claimed.current || !hasPlayed(momentKey));
  React.useEffect(() => {
    if (!visible) return undefined;
    if (!claimed.current) {
      if (!shouldPlayOnce(momentKey)) return undefined;
      claimed.current = true;
    }
    const timer = setTimeout(() => {
      if (done.current) return;
      done.current = true; callback.current();
    }, duelEntranceDurationMs(Boolean(reduced)));
    return () => clearTimeout(timer);
  }, [visible, momentKey, reduced]);
  if (!visible) return null;
  const event = duel.status === 'settled' ? 'OFFICIAL RESULT' : duel.status === 'cancelled' ? 'CLASH CLOSED'
    : phase === 'closed' ? 'AWAITING SETTLEMENT' : phase === 'judging' ? 'COMMUNITY JUDGING'
    : phase === 'final_arguments' ? 'FINAL ARGUMENTS' : phase === 'scheduled' ? 'UPCOMING CLASH' : 'LIVE DUEL';
  return <Pressable accessibilityRole="button" accessibilityLabel="Skip Clash intro"
    accessibilityHint="Dismisses the fighter introduction and enters the Stage"
    onPress={() => { if (!done.current) { done.current = true; callback.current(); } }}
    style={[styles.root, { backgroundColor: t.background, paddingTop: Math.max(insets.top, space.md), paddingBottom: Math.max(insets.bottom, space.md) }]}>
    <View style={styles.content}>
      <Text style={[styles.kicker, { color: t.textSecondary }]}>{event}</Text>
      <Text style={[styles.takeLabel, { color: t.textMuted }]}>THE TAKE</Text>
      <Text numberOfLines={3} style={[styles.proposition, { color: t.textPrimary }]}>{proposition}</Text>
      <View style={styles.matchup}>
        {([duel.fighterA, duel.fighterB] as const).map((fighter, index) => <Animated.View key={fighter.id}
          entering={reduced ? undefined : FadeInDown.duration(180 + index * 60)} style={styles.fighter}>
          <Text style={[styles.takeLabel, { color: t.textMuted }]}>FIGHTER {index === 0 ? 'A' : 'B'}</Text>
          <Avatar name={fighter.name} tint={fighter.tint ?? t.textMuted} size={48} />
          <Text numberOfLines={2} style={[styles.name, { color: t.textPrimary }]}>{fighter.name}</Text>
          <Text numberOfLines={2} style={[styles.handle, { color: t.textSecondary }]}>@{fighter.handle}</Text>
        </Animated.View>)}
      </View>
      <Text style={[styles.versus, { color: t.textSecondary }]}>TWO PERSPECTIVES. ONE STAGE.</Text>
      <Text style={[styles.handle, { color: t.textMuted }]}>Tap anywhere to skip. Full positions inside</Text>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 30, justifyContent: 'center' },
  content: { paddingHorizontal: space.lg, gap: space.md, alignItems: 'center' },
  kicker: { ...typeScale.caption, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  takeLabel: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  proposition: { ...typeScale.title, fontSize: 22, lineHeight: 29, textAlign: 'center', fontWeight: '700' },
  matchup: { flexDirection: 'row', gap: space.md, width: '100%', paddingVertical: space.md },
  fighter: { flex: 1, minWidth: 0, alignItems: 'center', gap: space.sm },
  name: { ...typeScale.label, fontSize: 16, lineHeight: 23, fontWeight: '700', textAlign: 'center', width: '100%' },
  handle: { ...typeScale.caption, fontSize: 12, lineHeight: 18, textAlign: 'center', width: '100%' },
  versus: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});
