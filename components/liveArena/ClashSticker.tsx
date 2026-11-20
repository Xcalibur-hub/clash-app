/**
 * Typographic CLASH stickers — no marketplace, no fake uploaded assets.
 * Mirrors the Arena reaction vocabulary as compact stamp chips.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ARENA_REACTIONS } from '../../utils/arenaGameState';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/** Short stamp labels for sticker-like presentation. */
const STAMP: Record<string, string> = {
  '🔥': 'COOKED',
  '🧢': 'CAP',
  '🧾': 'RECEIPTS',
  '💀': 'BRO...',
  '🤯': 'PLOT TWIST',
  '⚔': 'CALLED OUT',
  '🧠': 'MINDSHIFT',
};

export interface ClashStickerRowProps {
  /** Optional: tap a sticker to react with that emoji. */
  onPick?: (emoji: string) => void;
  compact?: boolean;
}

/** Starter sticker strip for composers / empty floors — presentation only. */
export function ClashStickerRow({
  onPick,
  compact = false,
}: ClashStickerRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {ARENA_REACTIONS.map((reaction) => {
        const stamp = STAMP[reaction.emoji] ?? reaction.label.toUpperCase();
        return (
          <Pressable
            key={reaction.emoji}
            disabled={!onPick}
            onPress={() => {
              if (!onPick) return;
              hapticTap();
              onPick(reaction.emoji);
            }}
            accessibilityRole={onPick ? 'button' : undefined}
            accessibilityLabel={onPick ? `Sticker ${stamp}` : stamp}
            style={[
              styles.chip,
              {
                borderColor: t.border,
                backgroundColor: t.surfaceElevated,
              },
              compact && styles.chipCompact,
            ]}
          >
            <Text allowFontScaling={false} style={styles.emoji}>
              {reaction.emoji}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.stamp, { color: t.textMuted }]}
              numberOfLines={1}
            >
              {stamp}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function clashStampForEmoji(emoji: string): string {
  return STAMP[emoji] ?? emoji;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowCompact: { gap: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipCompact: { paddingHorizontal: 6, paddingVertical: 3 },
  emoji: { fontSize: 12 },
  stamp: {
    ...typeScale.caption,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
