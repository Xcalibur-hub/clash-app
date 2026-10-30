import React from 'react';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useThemeColors } from '../../theme';
import { arenaDemoAllowed } from '../../utils/arenaDemoGate';
import { ArenaButton } from '../../components/arena/ui/ArenaPrimitives';
import { BeaconExperience } from '../../components/world/beacon/BeaconExperience';

export default function BeaconRoute(): React.JSX.Element {
  const router = useRouter(), { user } = useAuth(), t = useThemeColors(), insets = useSafeAreaInsets();
  const exit = () => router.canGoBack() ? router.back() : router.replace('/world');
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return <View style={{ flex: 1, backgroundColor: t.background, padding: 24, paddingTop: insets.top + 24 }}>
    <Text style={{ color: t.textPrimary, fontSize: 24 }}>This fictional expedition is available only in the development preview.</Text>
    <ArenaButton label="Return to World" onPress={exit} />
  </View>;
  return <BeaconExperience key={user?.id ?? 'guest'} onExit={exit} />;
}
