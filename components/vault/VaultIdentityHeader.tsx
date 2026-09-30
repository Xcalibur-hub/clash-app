import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { GlowButton } from '../shared/GlowButton';

export interface VaultIdentityHeaderProps {
  creator: User;
  vault: CreatorVault;
  following: boolean;
  followerCount: number;
  isSelf: boolean;
  subscription: VaultSubscriptionState | null;
  onToggleFollow?: () => void;
  onManage?: () => void;
}

function subscriptionLabel(subscription: VaultSubscriptionState | null): string | null {
  if (!subscription) return null;
  if (subscription.active) {
    return subscription.status === 'trial' ? 'Free trial' : 'Subscribed';
  }
  if (subscription.status === 'cancelled') return 'Membership ends soon';
  if (subscription.status === 'expired') return 'Membership expired';
  return null;
}

/**
 * Creator-led Vault hero — identity and space first, chrome second.
 * Content below remains the visual focus.
 */
export function VaultIdentityHeader({
  creator,
  vault,
  following,
  followerCount,
  isSelf,
  subscription,
  onToggleFollow,
  onManage,
}: VaultIdentityHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const subLabel = subscriptionLabel(subscription);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.heroPlate,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            shadowColor: t.shadowColor,
            shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
          },
        ]}
      >
        <Avatar name={creator.name} tint={creator.tint} size={88} />
        <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={2}>
          {creator.name}
        </Text>
        <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
          @{creator.handle}
          {followerCount > 0 ? ` · ${compact(followerCount)} followers` : ''}
        </Text>
        <Text allowFontScaling={false} style={[styles.vaultTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {vault.title}
        </Text>
        {vault.description ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]}>
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
            <GlowButton
              label="Manage"
              tone="ink"
              compact
              onPress={onManage ?? (() => undefined)}
            />
          ) : (
            <GlowButton
              label={following ? 'Following' : 'Follow'}
              tone={following ? 'ink' : 'light'}
              compact
              onPress={onToggleFollow ?? (() => undefined)}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  heroPlate: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  name: { ...typeScale.title, textAlign: 'center', marginTop: space.xs },
  handle: { ...typeScale.meta, textAlign: 'center' },
  vaultTitle: { ...typeScale.section, textAlign: 'center', marginTop: space.sm },
  description: { ...typeScale.body, textAlign: 'center' },
  access: { ...typeScale.caption, letterSpacing: 0.4, marginTop: 2 },
  actions: { marginTop: space.sm },
});
