import React from 'react';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arenaDemoAllowed } from '../../utils/arenaDemoGate';
import { useAuth } from '../../store/AuthProvider';
import { useThemeColors } from '../../theme';
import { VaultActionButton } from '../../components/vault/VaultActionButton';
import { StoryExperience } from '../../components/vault/story/StoryExperience';

export default function StoryRoute(): React.JSX.Element {
  const router = useRouter(), { user } = useAuth(), t = useThemeColors(), insets = useSafeAreaInsets();
  const exit = () => router.canGoBack() ? router.back() : router.replace('/(vault)');
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return <View style={{ flex: 1, backgroundColor: t.background, padding: 24, paddingTop: insets.top + 24 }}>
    <Text style={{ color: t.textPrimary, fontSize: 24 }}>Story Lab is available only in the development preview.</Text>
    <VaultActionButton label="Back to Vault" onPress={exit} />
  </View>;
  return <StoryExperience key={user?.id ?? 'guest'} onExit={exit} />;
}
