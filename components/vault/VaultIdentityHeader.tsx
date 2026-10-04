import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { creatorIdentityLine } from '../../utils/vaultPresentation';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export interface VaultIdentityHeaderProps {
  creator: User;
  vault: CreatorVault;
  following: boolean;
  followerCount: number;
  isSelf: boolean;
  subscription: VaultSubscriptionState | null;
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
 * Immersive Creator World hero — Explore media language + intimate creator entry.
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
  const fallback = creator.tint || (t.scheme === 'light' ? '#2C3340' : '#1A1A20');

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.heroBleed,
          {
            marginHorizontal: -layout.screenX,
            backgroundColor: fallback,
            borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
          },
        ]}
      >
        {heroUrl ? (
          <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#121216']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.scrim} />
        <View style={styles.heroCopy}>
          <Text allowFontScaling={false} style={styles.kind}>
            CREATOR WORLD
          </Text>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
            {creator.name}
          </Text>
          <Text allowFontScaling={false} style={styles.identity} numberOfLines={2}>
            {identity}
          </Text>
        </View>
      </View>

      <View style={[styles.overlap, { backgroundColor: t.background }]}>
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
  heroBleed: {
    aspectRatio: 4 / 5,
    width: 'auto',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  heroCopy: {
    gap: 6,
    paddingBottom: space.xxl + 8,
    paddingHorizontal: layout.screenX + 4,
    paddingTop: space.xxxl,
  },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.78)',
  },
  name: {
    ...typeScale.display,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.4,
    color: '#FAFAF8',
  },
  identity: {
    ...typeScale.body,
    fontSize: 15,
    color: 'rgba(250,250,248,0.84)',
    maxWidth: 300,
  },
  overlap: {
    gap: space.sm,
    marginTop: -space.lg,
    marginHorizontal: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    borderRadius: radius.xxl,
  },
  vaultTitle: {
    ...typeScale.section,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  description: { ...typeScale.body, fontSize: 15 },
  access: { ...typeScale.caption, letterSpacing: 0.4, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
});
