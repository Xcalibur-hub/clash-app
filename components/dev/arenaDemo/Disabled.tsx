import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
export default function Disabled(): React.JSX.Element {
  const router = useRouter();
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
    <Text>Demo Arena is available only in development builds.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)')} style={{ minHeight: 48, justifyContent: 'center' }}><Text>Back to CLASH</Text></Pressable>
  </View>;
}
