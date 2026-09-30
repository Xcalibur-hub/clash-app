/**
 * Legacy mock campaign radar route — redirects into Sponsor Studio.
 * Production campaign management lives at /sponsor/[campaignId].
 */
import React from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../../theme';

export default function LegacyCampaignRedirect(): React.JSX.Element {
  const t = useThemeColors();
  const { campaignId } = useLocalSearchParams<{ campaignId?: string }>();
  const id = String(campaignId ?? '');

  // Real sponsor campaign ids are adv_/camp_ style from RPCs; mock ids were cmp-*.
  if (id.startsWith('camp_') || id.startsWith('cmp_')) {
    return <Redirect href={`/sponsor/${id}`} />;
  }
  if (id) {
    return <Redirect href={`/sponsor/${id}`} />;
  }
  return <View style={{ flex: 1, backgroundColor: t.background }} />;
}
