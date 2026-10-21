/**
 * Accept beat: confirmed → fighters enter → ENTERING ARENA (~800–1200ms total handled by parent).
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useReducedMotion,
} from 'react-native-reanimated';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';


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

        <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.content}>
          <Text style={[styles.kicker, { color: t.textMuted }]}>
            CHALLENGE ACCEPTED
          </Text>
          <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
            You're in.
          </Text>

          <View testID="confirmation-fighters" style={styles.row}>
            <View testID="confirmation-fighter-a" style={styles.col}>
              <Avatar name={fighterA.name} tint={fighterA.tint ?? t.textMuted} size={56} />
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {fighterA.name}
              </Text>
              <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                @{fighterA.handle}
              </Text>
            </View>
            <Text style={[styles.vs, { color: t.textSecondary }]}
            >
              VS
            </Text>
            <View testID="confirmation-fighter-b" style={styles.col}>
              <Avatar name={fighterB.name} tint={fighterB.tint ?? t.textMuted} size={56} />
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {fighterB.name}
              </Text>
              <Text numberOfLines={1} style={[styles.handle, { color: t.textMuted }]}>
                @{fighterB.handle}
              </Text>
            </View>
          </View>

          <Text style={[styles.enter, { color: t.textSecondary }]}>
            ENTERING ARENA
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  content: {
    zIndex: 1,
    paddingHorizontal: 20,
    width: '100%', maxWidth: 440, alignSelf: 'center',
    gap: 24,
    alignItems: 'center',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    ...typeScale.title,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  col: { width: '40%', flexGrow: 1, flexBasis: 0, alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...typeScale.label, fontSize: 17, fontWeight: '700', textAlign: 'center', width: '100%' },
  handle: { ...typeScale.caption, fontSize: 13, textAlign: 'center', width: '100%' },
  vs: {
    ...typeScale.caption,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  enter: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: space.md,
  },
});
