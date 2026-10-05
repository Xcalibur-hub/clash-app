/**
 * Fast entertainment reactions — explicitly NOT judgement votes.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { QUICK_ARENA_REACTIONS } from '../../utils/arenaGameState';
import { tap as hapticTap } from '../../utils/haptics';

export interface QuickReactionRowProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

export function QuickReactionRow({ onPick, disabled }: QuickReactionRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
        React for fun — not a vote
      </Text>
      <View style={styles.row}>
        {QUICK_ARENA_REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            disabled={disabled}
            onPress={() => {
              hapticTap();
              onPick(emoji);
            }}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            style={[styles.chip, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}
          >
            <Text allowFontScaling={false} style={styles.emoji}>
              {emoji}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, paddingVertical: 4 },
  hint: { ...typeScale.caption, fontSize: 10, paddingHorizontal: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20, lineHeight: 24 },
});
