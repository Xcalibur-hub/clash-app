import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { creatorIdentityLine, vaultTintWash } from '../../utils/vaultPresentation';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export interface VaultIdentityHeaderProps {
  creator: User;
  vault: CreatorVault;
  following: boolean;
  followerCount: number;
  isSelf: boolean;
  subscription: VaultSubscriptionState | null;
  /** Optional public hero from a free/preview drop — content sets atmosphere. */
  heroUrl?: string | null;
  onToggleFollow?: () => void;
  onSubscribe?: () => void;
  onManage?: () => void;
}

function subscriptionLabel(subscription: VaultSubscriptionState | null): string | null {
  if (!subscription) return null;
  if (subscription.active) return 'Inside this world';
  if (subscription.status === 'cancelled') return 'Access ending soon';
  if (subscription.status === 'expired') return 'Access ended';
  return null;
}

/**
 * Immersive Creator World hero — artist universe entry, not a social profile.
 */
export function VaultIdentityHeader({
  creator,
  vault,
  following,
  isSelf,
  subscription,
  heroUrl,
  onToggleFollow,
  onSubscribe,
  onManage,
}: VaultIdentityHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const subLabel = subscriptionLabel(subscription);
  const subscribed = subscription?.active === true;
  const identity = creatorIdentityLine(creator.bio ?? vault.description, vault.title);
  const wash = vaultTintWash(creator.tint, t.scheme === 'dark' ? 0.2 : 0.1);

  return (
    <View style={styles.wrap}>
      <View style={[styles.heroBleed, { marginHorizontal: -layout.screenX }]}>
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {heroUrl ? (
            <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={[styles.tint, { backgroundColor: wash }]} />
          <View style={styles.heroScrim} />
          <View style={styles.heroCopy}>
            <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
              {creator.name.toUpperCase()}
            </Text>
            <Text allowFontScaling={false} style={styles.identity} numberOfLines={2}>
              {identity}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.below}>
        <Text allowFontScaling={false} style={[styles.vaultTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {vault.title}
        </Text>
        {creator.bio && creator.bio !== identity ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={3}>
            {creator.bio}
          </Text>
        ) : vault.description ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={3}>
            {vault.description}
          </Text>
        ) : null}
        {subLabel ? (
          <Text allowFontScaling={false} style={[styles.access, { color: t.textMuted }]}>
            {subLabel}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {isSelf ? (
            <VaultActionButton label="Manage" tone="quiet" compact onPress={onManage ?? (() => undefined)} />
          ) : (
            <>
              <VaultActionButton
                label={following ? 'Following' : 'Follow'}
                tone={following ? 'quiet' : 'solid'}
                compact
                onPress={onToggleFollow ?? (() => undefined)}
              />
              {!subscribed ? (
                <VaultActionButton
                  label="Subscribe"
                  tone="quiet"
                  compact
                  onPress={onSubscribe ?? (() => undefined)}
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  heroBleed: { width: 'auto' },
  hero: {
    aspectRatio: 4 / 5,
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  tint: { ...StyleSheet.absoluteFillObject },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.34)',
  },
  heroCopy: {
    gap: 8,
    paddingBottom: space.xxl,
    paddingHorizontal: layout.screenX + 4,
    paddingTop: space.xxxl,
  },
  name: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '700',
    letterSpacing: -1.6,
    color: '#FAFAF8',
  },
  identity: {
    ...typeScale.body,
    color: 'rgba(250,250,248,0.86)',
    maxWidth: 280,
  },
  below: {
    gap: space.sm,
    paddingTop: space.lg,
    marginTop: -space.md,
  },
  vaultTitle: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  description: { ...typeScale.body, fontSize: 15 },
  access: { ...typeScale.caption, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
