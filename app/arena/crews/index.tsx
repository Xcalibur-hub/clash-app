import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { GroupDiscovery } from '../../../components/arena/groups/GroupDiscovery';
import { layout, useThemeColors } from '../../../theme';
export default function CrewDiscoveryScreen(): React.JSX.Element {
  const router = useRouter(),
    insets = useSafeAreaInsets(),
    t = useThemeColors();
  return <View style={{
    flex: 1,
    backgroundColor: t.background
  }}>
    <View style={{
      paddingTop: insets.top,
      paddingHorizontal: layout.screenX,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12
    }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{
        width: 44,
        height: 44,
        justifyContent: 'center'
      }}><ArrowLeft color={t.textPrimary} size={22} /></Pressable>
      <Text style={{
        color: t.textPrimary,
        fontSize: 18,
        fontWeight: '700'
      }}>Groups</Text></View>
    <ScrollView contentContainerStyle={{
      paddingBottom: insets.bottom + 24
    }}><GroupDiscovery advanced /></ScrollView>
  </View>;
}
