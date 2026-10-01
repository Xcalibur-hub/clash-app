/**
 * DEV-only Sentry smoke control.
 *
 * NOT mounted by the app root. To use internally, temporarily mount from a
 * debug screen AND set EXPO_PUBLIC_SENTRY_TEST=1 on that build.
 * Never ship this in ordinary development / preview / production UI.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const testFlag = process.env.EXPO_PUBLIC_SENTRY_TEST === '1';

export function SentryTestTrigger(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  if (!testFlag) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 88 }]}
    >
      <Pressable
        accessibilityLabel="Send Sentry test crash"
        onPress={() => {
          throw new Error('CLASH Sentry test crash');
        }}
        style={styles.btn}
      >
        <Text style={styles.label}>Sentry test</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    zIndex: 9999,
  },
  btn: {
    backgroundColor: 'rgba(180, 40, 40, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  label: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
