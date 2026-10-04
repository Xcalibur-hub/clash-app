import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
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
 * Creator World hero — large visual, identity, Follow / Subscribe.
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

  return (
    <View style={styles.wrap}>
      <View style={[styles.heroBleed, { marginHorizontal: -layout.screenX }]}>
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {heroUrl ? (
            <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={styles.heroScrim} />
          <View style={styles.heroIdentity}>
            <Avatar name={creator.name} tint={creator.tint} size={72} />
            <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
              {creator.name}
            </Text>
            <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
              @{creator.handle}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.vaultTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {vault.title}
        </Text>
        {vault.description || creator.bio ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]}>
            {vault.description || creator.bio}
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
  wrap: { gap: space.md },
  heroBleed: { width: 'auto' },
  hero: {
    aspectRatio: 5 / 4,
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
  heroIdentity: {
    alignItems: 'center',
    gap: 6,
    paddingBottom: space.xl,
    paddingHorizontal: space.lg,
  },
  name: { ...typeScale.title, color: '#FAFAF8', textAlign: 'center' },
  handle: { ...typeScale.meta, color: 'rgba(250,250,248,0.8)', textAlign: 'center' },
  copy: { gap: space.sm },
  vaultTitle: { ...typeScale.section },
  description: { ...typeScale.body },
  access: { ...typeScale.caption, letterSpacing: 0.4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
