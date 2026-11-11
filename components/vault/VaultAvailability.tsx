import React from 'react';
import { Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export type VaultAvailabilityState = 'free' | 'member' | 'available' | 'locked' | 'preview' | 'unavailable';
const LABELS: Record<VaultAvailabilityState, string> = {
  free: 'Free', member: 'Member access', available: 'Access available', locked: 'Locked',
  preview: 'Preview only', unavailable: 'Unavailable',
};
/** Presentation only. Callers must use server accessibility, never infer entitlement from a price. */
export function VaultAvailability({ state, detail }: { state: VaultAvailabilityState; detail?: string }): React.JSX.Element {
  const t = useThemeColors();
  return <View style={{ gap: space.xs, borderLeftWidth: 2, borderColor: t.border, paddingLeft: space.md }}>
    <Text style={{ ...typeScale.label, color: t.textPrimary }}>{LABELS[state]}</Text>
    {detail ? <Text style={{ ...typeScale.body, color: t.textSecondary }}>{detail}</Text> : null}
    {state === 'locked' || state === 'preview' ? <Text style={{ ...typeScale.body, color: t.textMuted }}>
      New subscriptions and in-app purchases are unavailable in this build. Existing permissions are unchanged.
    </Text> : null}
  </View>;
}

/** Admission availability, independent of existing content entitlement above. */
export function VaultPublishingAvailability(): React.JSX.Element {
  const t = useThemeColors();
  return <Text style={{ ...typeScale.meta, color: t.textSecondary }}>
    Browse public free content and your authorized library. New publishing, purchases and creator hosting are unavailable in this beta.
  </Text>;
}
