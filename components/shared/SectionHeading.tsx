import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  /** Kept for compatibility — no longer draws a hand-drawn underline. */
  marked?: boolean;
  /** Kept for compatibility — no longer italicises. */
  editorial?: boolean;
  accessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Eyebrow + title pair used to open every block of content. */
export function SectionHeading({
  eyebrow,
  title,
  accessory,
  style,
}: SectionHeadingProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          {eyebrow}
        </Text>
        {accessory}
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xxs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption },
  title: { ...typeScale.section },
});
