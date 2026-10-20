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
      numberOfLines={condensed ? 2 : undefined}
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
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.45,
    textAlign: 'left',
    paddingHorizontal: layout.screenX,
    paddingBottom: 2,
  },
  condensed: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
});
