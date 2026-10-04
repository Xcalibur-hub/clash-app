import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';

export interface ChapterHeadingProps {
  title: string;
  /** Chapter number rendered as large editorial numerals. */
  index?: number;
  eyebrow?: string | null;
  count?: number | null;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Chapter opener: optional kicker, a large number, big typography and a hairline
 * rule. This is the primary section language of a Creator World — not a pill,
 * not a card header.
 */
export function ChapterHeading({
  title,
  index,
  eyebrow,
  count,
  trailing,
  style,
}: ChapterHeadingProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.wrap, style]}>
      {eyebrow ? (
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          {eyebrow}
        </Text>
      ) : null}
      <View style={styles.row}>
        {index != null ? (
          <Text allowFontScaling={false} style={[styles.index, { color: t.textMuted }]}>
            {String(index).padStart(2, '0')}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {trailing ??
          (count != null ? (
            <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
              {String(count)}
            </Text>
          ) : null)}
      </View>
      <View style={[styles.rule, { backgroundColor: t.borderStrong }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: space.sm },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  index: {
    fontFamily: typeScale.data.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  title: {
    flex: 1,
    ...typeScale.display,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -1,
  },
  count: {
    ...typeScale.data,
    fontSize: 13,
    marginBottom: 3,
  },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 2 },
});
