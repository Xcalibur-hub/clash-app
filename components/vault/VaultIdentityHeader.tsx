import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { creatorIdentityLine } from '../../utils/vaultPresentation';
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../theme';
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
 * Immersive Creator World hero — identity on media, compact actions, tight handoff to content.
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
  const reduced = useReducedMotion();
  const subLabel = subscriptionLabel(subscription);
  const subscribed = subscription?.active === true;
  const identity = creatorIdentityLine(creator.bio ?? vault.description, vault.title);
  const fallback = creator.tint || (t.scheme === 'light' ? '#2C3340' : '#141418');
  const showVaultTitle = vault.title.trim().length > 0 && vault.title.trim() !== creator.name;
  const extraBio =
    creator.bio && creator.bio !== identity
      ? creator.bio
      : vault.description && vault.description !== identity
        ? vault.description
        : null;

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
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#0E0E12']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.scrim} />
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
          {subLabel ? (
            <Text allowFontScaling={false} style={styles.accessOnMedia}>
              {subLabel}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {isSelf ? (
              <VaultActionButton
                label="Manage"
                tone="quiet"
                compact
                overMedia
                onPress={onManage ?? (() => undefined)}
              />
            ) : (
              <>
                <VaultActionButton
                  label={following ? 'Following' : 'Follow'}
                  tone={following ? 'quiet' : 'solid'}
                  compact
                  overMedia
                  onPress={onToggleFollow ?? (() => undefined)}
                />
                {!subscribed ? (
                  <VaultActionButton
                    label="Subscribe"
                    tone="quiet"
                    compact
                    overMedia
                    onPress={onSubscribe ?? (() => undefined)}
                  />
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>

      {(showVaultTitle || extraBio) && (
        <Animated.View
          entering={reduced ? undefined : FadeInUp.duration(duration.base)}
          style={[
            styles.overlap,
            {
              backgroundColor: t.scheme === 'light' ? t.background : 'rgba(12,12,14,0.92)',
              borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
            },
          ]}
        >
          {showVaultTitle ? (
            <Text allowFontScaling={false} style={[styles.vaultTitle, { color: t.textPrimary }]} numberOfLines={2}>
              {vault.title}
            </Text>
          ) : null}
          {extraBio ? (
            <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={2}>
              {extraBio}
            </Text>
          ) : null}
        </Animated.View>
      )}
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
    height: '68%',
  },
  heroCopy: {
    gap: 5,
    paddingBottom: space.xl,
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
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.3,
    color: '#FAFAF8',
  },
  identity: {
    ...typeScale.body,
    fontSize: 15,
    color: 'rgba(250,250,248,0.86)',
    maxWidth: 300,
  },
  accessOnMedia: {
    ...typeScale.caption,
    letterSpacing: 0.4,
    fontWeight: '600',
    color: 'rgba(250,250,248,0.7)',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  overlap: {
    gap: 4,
    marginTop: -space.md,
    marginHorizontal: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  vaultTitle: {
    ...typeScale.section,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  description: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
});
