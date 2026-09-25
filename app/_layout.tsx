import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClashProvider } from '../store';
import { color } from '../theme';

/**
 * Root shell.
 *
 * index    → animated splash, then Arena (or onboarding on first run)
 * onboard  → 3-screen first-launch sequence
 * (tabs)   → Arena + Profile behind the glass tab bar
 * (vault)  → Vault + Creators + Radar + Analytics + Profile (premium realm)
 * clash/*  → the duel, pushed as a modal-feeling card
 * creator/* → Vault creator profiles (public vs exclusive drops)
 * campaign/*, sponsor/* → radar detail + sponsor dashboard
 */
export default function RootLayout(): React.JSX.Element {
  React.useEffect(() => {
    void SystemUI.setBackgroundColorAsync(color.bg).catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ClashProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: color.bg },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboard" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(vault)" />
            <Stack.Screen name="clash/[takeId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="creator/[creatorId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="campaign/[campaignId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="sponsor/[campaignId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="take/[takeId]" options={{ animation: 'slide_from_right' }} />

          </Stack>
        </ClashProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
