import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { aiDisclosureDetail, aiDisclosureLabel } from '../../../utils/creatorAiState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';

export interface AiDisclosureProps {
  displayName: string;
  creatorName: string | null;
  /** Compact form for the chapter; the full sentence for the room. */
  variant?: 'full' | 'badge';
}

/**
 * The mandatory disclosure. It stays on screen for the whole conversation, so an
 * AI reply can never be mistaken for the human creator.
 */
export function AiDisclosure({
  displayName,
  creatorName,
  variant = 'full',
}: AiDisclosureProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View
      style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}
      accessibilityRole="text"
      accessibilityLabel={`${aiDisclosureLabel(creatorName)}. ${aiDisclosureDetail({ displayName, creatorName })}`}
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: t.textPrimary }]} />
        <Text allowFontScaling={false} style={[styles.label, { color: t.textPrimary }]}>
          {aiDisclosureLabel(creatorName)}
        </Text>
      </View>
      {variant === 'full' ? (
        <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
          {aiDisclosureDetail({ displayName, creatorName })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  body: { ...typeScale.meta, fontSize: 12, lineHeight: 16 },
});
