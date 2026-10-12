import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, SettingsIcon } from '../../components/shared/icons';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export default function SettingsScreen(): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), router = useRouter();
  return <View style={{ flex: 1, backgroundColor: t.background, paddingTop: insets.top, paddingHorizontal: layout.screenX }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <BackIcon size={20} color={t.textPrimary} /><Text style={{ color: t.textPrimary }}>Back</Text>
    </Pressable>
    <Text accessibilityRole="header" style={{ ...typeScale.title, color: t.textPrimary }}>Settings</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Safety settings" onPress={() => router.push('/settings/safety')}
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <SettingsIcon size={20} color={t.textPrimary} /><Text style={{ ...typeScale.body, color: t.textPrimary }}>Safety settings</Text>
    </Pressable>
  </View>;
}
