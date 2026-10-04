import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';

export interface WorldHeroMetaProps {
  secondary?: string | null;
  description?: string | null;
}

/** The editorial block tucked under the hero: world name + creator line. */
export function WorldHeroMeta({
  secondary,
  description,
}: WorldHeroMetaProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (!secondary && !description) return null;
  return (
    <View style={[styles.wrap, { borderLeftColor: t.borderStrong }]}>
      {secondary ? (
        <Text allowFontScaling={false} style={[styles.secondary, { color: t.textPrimary }]} numberOfLines={2}>
          {secondary}
        </Text>
      ) : null}
      {description ? (
        <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.md, paddingLeft: space.md, borderLeftWidth: 2, gap: 4 },
  secondary: { ...typeScale.section, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  description: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
});
