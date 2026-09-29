import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stance } from '../../services/mindshiftService';
import { card, ink, layout, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const CHOICES: readonly { key: Stance; label: string }[] = [
  { key: 'AGREE', label: 'Agree' },
  { key: 'UNSURE', label: 'Unsure' },
  { key: 'DISAGREE', label: 'Disagree' },
];

export interface StanceChoiceRowProps {
  prompt: string;
  disabled?: boolean;
  onChoose: (stance: Stance) => void;
}

/** Three equal, unaccented stance buttons — no side is preferred. */
export function StanceChoiceRow({ prompt, disabled, onChoose }: StanceChoiceRowProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.prompt}>{prompt}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={prompt}>
        {CHOICES.map((choice) => (
          <Pressable
            key={choice.key}
            disabled={disabled}
            onPress={() => {
              hapticTap();
              onChoose(choice.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <Text allowFontScaling={false} style={styles.label}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  prompt: { ...typeScale.label, color: ink.secondary, fontWeight: '600' },
  row: { flexDirection: 'row', gap: space.xs },
  btn: {
    flex: 1,
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
    paddingHorizontal: space.xs,
  },
  pressed: { backgroundColor: card.elevated },
  disabled: { opacity: 0.5 },
  label: { ...typeScale.label, color: ink.primary, fontWeight: '600' },
});
