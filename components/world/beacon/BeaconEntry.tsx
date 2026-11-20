import React from 'react';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { useThemeColors } from '../../../theme';

export function BeaconEntry(): React.JSX.Element | null {
  const t = useThemeColors(), router = useRouter();
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Explore The Lost Beacon fictional local mission" onPress={() => router.push('/world/beacon')}
    style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
    <Text style={[styles.meta, { color: t.textMuted }]}>WORLD LAB / LOCAL DEMO</Text>
    <Text style={[styles.title, { color: t.textPrimary }]}>The Lost Beacon</Text>
    <Text style={[styles.body, { color: t.textSecondary }]}>Explore Aster Reach. Follow three trails, collect evidence and restore a forgotten light.</Text>
    <Text style={[styles.meta, { color: t.textMuted }]}>No GPS, real places, saved progress or rewards.</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { padding: 20, borderWidth: 1, borderRadius: 24, gap: 10, minHeight: 176 },
  meta: { fontSize: 11, lineHeight: 19 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24 },
});
