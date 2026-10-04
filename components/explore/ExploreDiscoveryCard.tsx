/**
 * Shared Explore discovery card — media-first rail tile.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export type ExploreCardKind =
  | 'LIVE'
  | 'TAKE'
  | 'VAULT'
  | 'CHALLENGE'
  | 'TREASURE'
  | 'CREATOR'
  | 'CLASH';

export interface ExploreDiscoveryCardProps {
  kind: ExploreCardKind;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  mediaUrl?: string | null;
  accent?: string | null;
  width?: number;
  height?: number;
  onPress: () => void;
}

const KIND_LABEL: Record<ExploreCardKind, string> = {
  LIVE: 'LIVE',
  TAKE: 'TAKE',
  VAULT: 'VAULT PREVIEW',
  CHALLENGE: 'CHALLENGE',
  TREASURE: 'TREASURE',
  CREATOR: 'CREATOR',
  CLASH: 'CLASH',
};

export function ExploreDiscoveryCard({
  kind,
  title,
  subtitle = null,
  meta = null,
  mediaUrl = null,
  accent = null,
  width = 196,
  height = 240,
  onPress,
}: ExploreDiscoveryCardProps): React.JSX.Element {
  const t = useThemeColors();
  const fill = accent ?? (t.scheme === 'light' ? '#2C3340' : '#1A1A20');

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[styles.card, { width, height, backgroundColor: fill, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[kind]}. ${title}${subtitle ? `. ${subtitle}` : ''}`}
    >
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={[fill, t.scheme === 'light' ? '#C9C2B4' : '#0C0C10']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.scrim} />
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={styles.kind}>
          {KIND_LABEL[kind]}
        </Text>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={3}>
          {title}
        </Text>
        {subtitle ? (
          <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: space.md,
    gap: 4,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: 'rgba(255,255,255,0.78)',
  },
  title: {
    ...typeScale.label,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: '#FAFAF8',
  },
  sub: { ...typeScale.meta, fontSize: 13, color: 'rgba(255,255,255,0.74)' },
  meta: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.62)',
  },
});
