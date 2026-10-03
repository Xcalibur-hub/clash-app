/**
 * Shared Explore discovery card — Live / Take / Vault / Challenge / Treasure.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export type ExploreCardKind =
  | 'LIVE'
  | 'TAKE'
  | 'VAULT'
  | 'CHALLENGE'
  | 'TREASURE'
  | 'CREATOR';

export interface ExploreDiscoveryCardProps {
  kind: ExploreCardKind;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  onPress: () => void;
}

const KIND_LABEL: Record<ExploreCardKind, string> = {
  LIVE: 'LIVE',
  TAKE: 'TAKE',
  VAULT: 'VAULT PREVIEW',
  CHALLENGE: 'CHALLENGE',
  TREASURE: 'TREASURE',
  CREATOR: 'CREATOR',
};

export function ExploreDiscoveryCard({
  kind,
  title,
  subtitle = null,
  meta = null,
  onPress,
}: ExploreDiscoveryCardProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[
        styles.card,
        {
          backgroundColor: t.surfaceElevated,
          borderColor: t.border,
          shadowColor: t.shadowColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[kind]}. ${title}${subtitle ? `. ${subtitle}` : ''}`}
    >
      <Text allowFontScaling={false} style={[styles.kind, { color: t.textMuted }]}>
        {KIND_LABEL[kind]}
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={3}>
        {title}
      </Text>
      {subtitle ? (
        <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {meta ? (
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    minHeight: 140,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: 6,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  title: { ...typeScale.label, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  sub: { ...typeScale.meta, fontSize: 13 },
  meta: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
