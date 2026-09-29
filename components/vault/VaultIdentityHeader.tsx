import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import type { CreatorVault, VaultSubscriptionState } from '../../services/vaultMappers';
import { ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { GlowButton } from '../shared/GlowButton';
import { CrownIcon, VaultIcon } from '../shared/icons';

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
 * A compact, premium Vault header: creator identity first, then the Vault's own
 * title and description, then follow and subscription state. Deliberately
 * chrome-free — no hero, no glow — so the media below stays the focus.
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
  const subLabel = subscriptionLabel(subscription);
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Avatar name={creator.name} tint={creator.tint} size={52} />
        <View style={styles.names}>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
            {creator.name}
          </Text>
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{creator.handle} · {compact(followerCount)} followers
          </Text>
        </View>
        {isSelf ? (
          <GlowButton label="Manage" icon={VaultIcon} tone="ink" compact onPress={onManage ?? (() => undefined)} />
        ) : (
          <GlowButton
            label={following ? 'Following' : 'Follow'}
            tone={following ? 'ink' : 'light'}
            compact
            onPress={onToggleFollow ?? (() => undefined)}
          />
        )}
      </View>

      <View style={styles.titleRow}>
        <VaultIcon size={15} color={ink.tertiary} strokeWidth={2.2} />
        <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
          {vault.title}
        </Text>
      </View>
      {vault.description ? (
        <Text allowFontScaling={false} style={styles.description}>
          {vault.description}
        </Text>
      ) : null}

      {subLabel ? (
        <View style={styles.chips}>
          <Chip label={subLabel} icon={CrownIcon} tone="mint" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 2 },
  name: { ...typeScale.section, color: ink.primary },
  handle: { ...typeScale.meta, color: ink.tertiary },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  title: { ...typeScale.title, color: ink.primary },
  description: { ...typeScale.body, color: ink.secondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
