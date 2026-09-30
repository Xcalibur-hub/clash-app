import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClashProvider } from '../store';
import { AuthProvider } from '../store/AuthProvider';
import { AuthHydrator } from '../store/AuthHydrator';
import { FontBootstrap, ThemeProvider, useThemeColors } from '../theme';

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

function ThemedChrome({ children }: { children: React.ReactNode }): React.JSX.Element {
  const colors = useThemeColors();

  React.useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  return (
    <>
      <StatusBar style={colors.scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {children}
      </Stack>
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <ClashProvider>
            <ThemeProvider>
              <FontBootstrap>
                <AuthHydrator />
                <ThemedChrome>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="onboard" />
                  <Stack.Screen name="auth" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(vault)" />
                  <Stack.Screen name="clash/[takeId]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="vault/[creatorId]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="vault/drop/[dropId]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="vault/compose" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="campaign/[campaignId]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="sponsor/[campaignId]" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="take/[takeId]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="profile/[profileId]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="hood/[hoodId]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="hood/game/[gameId]" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="world/index" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="world/compose" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="world/drop/[dropId]" options={{ animation: 'slide_from_right' }} />
                </ThemedChrome>
              </FontBootstrap>
            </ThemeProvider>
          </ClashProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
