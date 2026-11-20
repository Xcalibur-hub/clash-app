/**
 * Spectator event tray + live-event join sheet.
 *
 * Stance note: spectators store null stance by design (privacy). Upgrade always
 * requires a fresh private stance choice — there is no safe reuse path.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import type { Stance } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { softFill } from './liveArenaStyles';

const CHOICES: readonly { key: Stance; label: string }[] = [
  { key: 'AGREE', label: 'Agree' },
  { key: 'UNSURE', label: 'Unsure' },
  { key: 'DISAGREE', label: 'Disagree' },
];

export interface SpectatorJoinBarProps {
  busy?: boolean;
  roomFull?: boolean;
  roomIndex?: number | null;
  onJoinPress: () => void;
}

export function SpectatorJoinBar({
  busy = false,
  roomFull = false,
  roomIndex = null,
  onJoinPress,
}: SpectatorJoinBarProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: t.surfaceElevated,
            borderColor: t.border,
            shadowColor: t.shadowColor,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
          {roomFull
            ? 'This room filled up while you were watching.'
            : roomIndex != null
              ? `WATCHER · Room ${roomIndex}`
              : 'WATCHER'}
        </Text>
        {!roomFull ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onJoinPress();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Pick a side and join"
            style={[styles.cta, { backgroundColor: t.clashFill }]}
          >
            {busy ? (
              <ActivityIndicator color={t.clashText} />
            ) : (
              <Text allowFontScaling={false} style={[styles.ctaText, { color: t.clashText }]}>
                PICK A SIDE
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface JoinDebateSheetProps {
  visible: boolean;
  busy?: boolean;
  roomIndex?: number | null;
  onClose: () => void;
  onChoose: (stance: Stance) => void;
}

/** Live-event stance chooser — large tactile choices, private by design. */
export function JoinDebateSheet({
  visible,
  busy = false,
  roomIndex = null,
  onClose,
  onChoose,
}: JoinDebateSheetProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
          onPress={() => undefined}
        >
          <Text allowFontScaling={false} style={[styles.sheetKicker, { color: t.textMuted }]}>
            {roomIndex != null ? `ENTER CLASH · Room ${roomIndex}` : 'ENTER CLASH'}
          </Text>
          <Text allowFontScaling={false} style={[styles.sheetTitle, { color: t.textPrimary }]}>
            Pick a side
          </Text>
          <Text allowFontScaling={false} style={[styles.sheetHint, { color: t.textMuted }]}>
            Private stance. React anytime — judging comes later.
          </Text>
          <Text allowFontScaling={false} style={[styles.sheetBody, { color: t.textMuted }]}>
            Your stance stays private. Capacity is checked by the server.
          </Text>
          <View style={styles.choices}>
            {CHOICES.map((choice) => (
              <StanceChoice
                key={choice.key}
                label={choice.label}
                disabled={busy}
                onPress={() => onChoose(choice.key)}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StanceChoice({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        hapticPress();
        if (!reduced) {
          scale.value = withSequence(
            withSpring(0.94, { damping: 14, stiffness: 420 }),
            withSpring(1, { damping: 12, stiffness: 280 }),
          );
        }
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.choiceHit}
    >
      <Animated.View
        style={[
          styles.choice,
          anim,
          {
            backgroundColor: softFill(t),
            borderColor: t.borderStrong,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.choiceText, { color: t.textPrimary }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  bar: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  watching: {
    ...typeScale.meta,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  cta: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...typeScale.label,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,11,0.5)',
    justifyContent: 'flex-end',
    padding: layout.screenX,
    paddingBottom: space.xxl,
  },
  sheet: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  sheetKicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sheetTitle: { ...typeScale.section, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  sheetHint: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  sheetBody: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  choices: { gap: space.sm, marginTop: space.xs },
  choiceHit: { width: '100%' },
  choice: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    ...typeScale.label,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
