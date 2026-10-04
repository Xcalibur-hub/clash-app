import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunityAccessType } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel, communityGateCopy } from '../../../utils/vaultCommunityAccess';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { LockIcon } from '../../shared/icons';
import { VaultActionButton } from '../VaultActionButton';

export interface CommunityGateProps {
  accessType: CommunityAccessType;
  creatorName: string;
  signedIn: boolean;
  following: boolean;
  subscribed: boolean;
  busy?: boolean;
  onFollow?: () => void;
  onSubscribe?: () => void;
  onSignIn?: () => void;
}

/** Shown when the viewer has not qualified for the community yet. */
export function CommunityGate({
  accessType,
  creatorName,
  signedIn,
  following,
  subscribed,
  busy = false,
  onFollow,
  onSubscribe,
  onSignIn,
}: CommunityGateProps): React.JSX.Element {
  const t = useThemeColors();
  const gate = communityGateCopy({ access: accessType, signedIn, following, subscribed, creatorName });
  const onPress =
    gate.action === 'follow'
      ? onFollow
      : gate.action === 'subscribe'
        ? onSubscribe
        : gate.action === 'signin'
          ? onSignIn
          : undefined;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[styles.badge, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
        <LockIcon size={16} color={t.textSecondary} strokeWidth={2.2} />
        <Text allowFontScaling={false} style={[styles.access, { color: t.textMuted }]}>
          {communityAccessLabel(accessType).toUpperCase()}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {gate.title}
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
        {gate.body}
      </Text>
      {onPress ? (
        <VaultActionButton
          label={busy ? 'Working…' : gate.actionLabel}
          onPress={onPress}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  access: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  title: { ...typeScale.section },
  body: { ...typeScale.body, fontSize: 14 },
});
