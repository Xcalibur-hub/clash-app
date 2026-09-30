import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';
import { Underline } from '../shared/Doodles';

export interface ExploreHeadingProps {
  title: string;
  accessory?: React.ReactNode;
  marked?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Compact editorial section label for Explore shelves. */
export function ExploreHeading({
  title,
  accessory,
  marked = false,
  style,
}: ExploreHeadingProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            {title}
          </Text>
          {marked ? <Underline size={64} color={t.textPrimary} opacity={0.2} style={styles.mark} /> : null}
        </View>
        {accessory}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  titleWrap: { flexShrink: 1 },
  title: {
    ...typeScale.section,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  mark: { marginTop: 1 },
});
