import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { PressableScale } from '../shared/PressableScale';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

export interface CreatorWorldCardProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
  featured?: boolean;
}

/**
 * Creator discovery card: who / what / what's happening now.
 * Does not fabricate categories — uses bio + latest drop when present.
 */
export const CreatorWorldCard = React.memo(function CreatorWorldCard({
  creator,
  onEnter,
  featured = false,
}: CreatorWorldCardProps): React.JSX.Element {
  const t = useThemeColors();
  const happening =
    creator.latestCaption != null
      ? `${creator.latestAccess === 'preview' ? 'PREVIEW' : 'NEW DROP'} · ${creator.latestCaption}`
      : null;

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onEnter();
      }}
      style={[
        styles.card,
        featured && styles.featured,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
        },
      ]}
      accessibilityLabel={`Enter ${creator.name}'s Vault`}
    >
      {creator.mediaUrl ? (
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          <Image source={{ uri: creator.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.heroScrim} />
        </View>
      ) : (
        <View style={[styles.heroEmpty, { backgroundColor: t.surfaceMuted }]} />
      )}

      <View style={styles.body}>
        <View style={styles.identity}>
          <Avatar name={creator.name} tint={creator.tint} size={44} />
          <View style={styles.identityText}>
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
              {creator.name}
            </Text>
            <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
              @{creator.handle}
            </Text>
          </View>
        </View>

        {creator.bio ? (
          <Text allowFontScaling={false} style={[styles.bio, { color: t.textSecondary }]} numberOfLines={2}>
            {creator.bio}
          </Text>
        ) : null}

        {happening ? (
          <Text allowFontScaling={false} style={[styles.now, { color: t.textMuted }]} numberOfLines={2}>
            {happening}
          </Text>
        ) : null}

        <VaultActionButton label="Enter Vault" onPress={onEnter} compact />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  featured: { width: '100%' },
  hero: { aspectRatio: 16 / 10, width: '100%' },
  heroEmpty: { height: 72, width: '100%' },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.12)',
  },
  body: {
    gap: space.sm,
    padding: space.lg,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  identityText: { flex: 1, gap: 2 },
  name: { ...typeScale.cardTitle },
  handle: { ...typeScale.meta },
  bio: { ...typeScale.body },
  now: { ...typeScale.meta, letterSpacing: 0.2 },
});
