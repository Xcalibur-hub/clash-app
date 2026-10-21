/**
 * Compact CLASH-native reaction tray.
 * Reactions entertain — they are never judgement votes.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { QuickReactionRow } from '../arena/QuickReactionRow';
import { ARENA_REACTIONS } from '../../utils/arenaGameState';
import { spectatorReactionHint } from '../../utils/spectatorPresentation';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { duration } from '../../theme/motion';
import { tap as hapticTap } from '../../utils/haptics';

export interface ArenaReactionPickerProps {
  visible: boolean;
  /** Emojis the viewer already has on this message. */
  activeEmojis?: readonly string[];
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export function ArenaReactionPicker({
  visible,
  activeEmojis = [],
  onClose,
  onPick,
}: ArenaReactionPickerProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const active = new Set(activeEmojis);

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reactions"
      >
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(duration.fast)}
          exiting={reduced ? undefined : FadeOut.duration(duration.instant)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              styles.tray,
              {
                backgroundColor: t.surfaceElevated,
                borderColor: t.borderStrong,
                shadowColor: t.shadowColor,
              },
            ]}
            accessibilityRole="menu"
            accessibilityLabel="React to this argument"
          >
            <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
              {spectatorReactionHint()}
            </Text>
            <QuickReactionRow
              onPick={(emoji) => {
                onPick(emoji);
                onClose();
              }}
            />
            <View style={styles.row}>
              {ARENA_REACTIONS.map((reaction) => {
                const selected = active.has(reaction.emoji);
                return (
                  <Pressable
                    key={reaction.emoji}
                    onPress={() => {
                      hapticTap();
                      onPick(reaction.emoji);
                      onClose();
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${reaction.label}${selected ? ', selected' : ''}`}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: selected ? t.surfaceMuted : 'transparent',
                        borderColor: selected ? t.textPrimary : 'transparent',
                      },
                    ]}
                  >
                    <Text allowFontScaling={false} style={styles.emoji}>
                      {reaction.emoji}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[styles.label, { color: selected ? t.textPrimary : t.textMuted }]}
                      numberOfLines={1}
                    >
                      {selected ? 'On' : reaction.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  tray: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    gap: space.sm,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  hint: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  cell: {
    minWidth: 72,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emoji: { fontSize: 22 },
  label: { ...typeScale.caption, fontSize: 9, fontWeight: '700' },
});
