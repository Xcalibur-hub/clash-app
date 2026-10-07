/**
 * Short post-ACCEPT beat before entering the canonical duel Room.
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { ArenaAtmosphere } from '../liveArena/ArenaAtmosphere';

export interface ClashConfirmedFighter {
  name: string;
  handle: string;
  tint?: string;
}

export interface ClashConfirmedOverlayProps {
  visible: boolean;
  fighterA: ClashConfirmedFighter;
  fighterB: ClashConfirmedFighter;
}

export function ClashConfirmedOverlay({
  visible,
  fighterA,
  fighterB,
}: ClashConfirmedOverlayProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: t.background }]} accessibilityViewIsModal>
        <ArenaAtmosphere mood="live" energy={0.35} />
        <View style={styles.content}>
          <Animated.Text
            entering={reduced ? undefined : FadeIn.duration(220)}
            style={[styles.kicker, { color: t.textMuted }]}
            accessibilityRole="header"
          >
            CLASH CONFIRMED
          </Animated.Text>
          <View style={styles.row}>
            <Animated.View
              entering={reduced ? undefined : ZoomIn.delay(60).springify().damping(14)}
              style={styles.col}
            >
              <Avatar name={fighterA.name} tint={fighterA.tint ?? t.textMuted} size={72} />
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {fighterA.name}
              </Text>
              <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                @{fighterA.handle}
              </Text>
            </Animated.View>
            <Animated.Text
              entering={reduced ? undefined : FadeIn.delay(120).duration(200)}
              style={[styles.vs, { color: t.textSecondary }]}
            >
              VS
            </Animated.Text>
            <Animated.View
              entering={reduced ? undefined : ZoomIn.delay(100).springify().damping(14)}
              style={styles.col}
            >
              <Avatar name={fighterB.name} tint={fighterB.tint ?? t.textMuted} size={72} />
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {fighterB.name}
              </Text>
              <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                @{fighterB.handle}
              </Text>
            </Animated.View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  content: {
    zIndex: 1,
    paddingHorizontal: space.lg,
    gap: space.xl,
    alignItems: 'center',
  },
  kicker: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
  },
  col: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...typeScale.label, fontSize: 16, fontWeight: '700', textAlign: 'center', width: '100%' },
  handle: { ...typeScale.caption, fontSize: 13, textAlign: 'center', width: '100%' },
  vs: {
    ...typeScale.caption,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
