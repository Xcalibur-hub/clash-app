import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { accent, ink, radius, space, tint, typeScale } from '../../theme';

export type ChipTone = 'neutral' | 'a' | 'b' | 'gold' | 'mint' | 'violet' | 'danger';

const TONES: Record<ChipTone, { fill: string; line: string; text: string }> = {
  neutral: { fill: tint.neutralSoft, line: 'rgba(255,255,255,0.14)', text: ink.secondary },
  a: { fill: tint.aSoft, line: tint.aLine, text: accent.a },
  b: { fill: tint.bSoft, line: tint.bLine, text: accent.b },
  gold: { fill: tint.goldSoft, line: 'rgba(255,200,97,0.42)', text: accent.gold },
  mint: { fill: tint.mintSoft, line: 'rgba(67,214,160,0.4)', text: accent.mint },
  violet: { fill: tint.violetSoft, line: 'rgba(165,128,255,0.42)', text: accent.violet },
  danger: { fill: 'rgba(255,77,94,0.14)', line: 'rgba(255,77,94,0.4)', text: accent.danger },
};

export interface ChipProps {
  label: string;
  icon?: LucideIcon;
  tone?: ChipTone;
  /** Monospaced numerals for counts and timers. */
  data?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Chip({
  label,
  icon: Icon,
  tone = 'neutral',
  data = false,
  style,
  textStyle,
}: ChipProps): React.JSX.Element {
  const palette = TONES[tone];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.fill, borderColor: palette.line },
        style,
      ]}
    >
      {Icon ? <Icon size={12} color={palette.text} strokeWidth={2.4} /> : null}
      <Text
        allowFontScaling={false}
        style={[
          data ? typeScale.data : typeScale.caption,
          { color: palette.text },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
