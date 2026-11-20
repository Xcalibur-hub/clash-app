import React from 'react';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { useThemeColors } from '../../../theme';

export function StoryEntry(): React.JSX.Element | null {
  const t = useThemeColors(), router = useRouter();
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Read The Last Signal local interactive story"
    onPress={() => router.push('/vault/story')} style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
    <Text style={[styles.meta, { color: t.textMuted }]}>STORY LAB / LOCAL DEMO</Text>
    <Text style={[styles.title, { color: t.textPrimary }]}>The Last Signal</Text>
    <Text style={[styles.body, { color: t.textSecondary }]}>An abandoned station. A voice you recognise. Three decisions that change what comes home.</Text>
    <Text style={[styles.body, { color: t.textPrimary }]}>Enter the mystery →</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 24, gap: 12, minHeight: 180 },
  meta: { fontSize: 11, lineHeight: 18, letterSpacing: 1.5 },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 25 },
});
