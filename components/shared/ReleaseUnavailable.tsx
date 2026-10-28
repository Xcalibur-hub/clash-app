import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, space, typeScale } from '../../theme';
import { releaseAllows, releaseUnavailableCopy, type ReleaseCapability } from '../../utils/releaseScope';

export function ReleaseUnavailable({ capability }: { capability: ReleaseCapability }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), router = useRouter();
  return <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, gap: space.md }}>
    <Text accessibilityRole="header" style={[typeScale.title, { color: t.textPrimary }]}>Not available in this beta</Text>
    <Text style={[typeScale.body, { color: t.textSecondary }]}>{releaseUnavailableCopy(capability)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: space.md }}>
      <Text style={[typeScale.label, { color: t.textPrimary }]}>Back</Text>
    </Pressable>
  </ScrollView>;
}

/** Child hooks cannot run on a blocked direct/deep-linked creation route. */
export function withReleaseAdmission(Screen: React.ComponentType, capability: ReleaseCapability): React.ComponentType {
  return function ReleaseAdmissionScreen() {
    return releaseAllows(capability, 'admit') ? <Screen /> : <ReleaseUnavailable capability={capability} />;
  };
}
