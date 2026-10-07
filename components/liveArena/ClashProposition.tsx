/**
 * Editorial proposition — what the fight is about.
 * No card wrapper; keeps vertical budget tight.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { layout, typeScale, useThemeColors } from '../../theme';

export interface ClashPropositionProps {
  text: string;
  condensed?: boolean;
}

export function ClashProposition({
  text,
  condensed = false,
}: ClashPropositionProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      selectable
      numberOfLines={condensed ? 2 : 3}
      style={[
        styles.text,
        condensed && styles.condensed,
        { color: t.textPrimary },
      ]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typeScale.title,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.55,
    textAlign: 'center',
    paddingHorizontal: layout.screenX + 4,
  },
  condensed: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
});
