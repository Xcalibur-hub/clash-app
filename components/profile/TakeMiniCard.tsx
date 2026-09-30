import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { space, typeScale, useThemeColors } from '../../theme';
import { compact, timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';

export interface TakeMiniCardProps {
  take: Take;
  now: number;
  onPress: () => void;
}

/** Viewer's own Take in Vault Profile — flatter, profile-oriented. */
export function TakeMiniCard({ take, now, onPress }: TakeMiniCardProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Your take: ${take.text}`}
      accessibilityHint="Opens the clash on this take"
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      <Text allowFontScaling={false} style={[styles.text, { color: t.textPrimary }]} numberOfLines={3}>
        {take.text}
      </Text>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {[
          HOOD_LABEL[take.hood],
          timeLeftLabel(take.expiresAt, now),
          take.clashes > 0 ? `${compact(take.clashes)} clashes` : null,
          take.reactions > 0 ? `${compact(take.reactions)} reactions` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  text: { ...typeScale.bodyStrong, fontSize: 15, lineHeight: 22 },
  meta: { ...typeScale.meta, fontSize: 12 },
});
