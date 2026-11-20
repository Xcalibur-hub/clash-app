import React from 'react';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { useThemeColors } from '../../../theme';
import { SignalPattern } from './SignalBoard';

export function SignalEntry(): React.JSX.Element | null {
  const t = useThemeColors(), router = useRouter();
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Open SIGNAL local skill game"
    onPress={() => router.push('/explore/play/signal')} style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
    <View style={styles.heading}><Text style={[styles.title, { color: t.textPrimary }]}>SIGNAL</Text><SignalPattern mask={25} size={3} /></View>
    <Text style={[styles.body, { color: t.textSecondary }]}>Find the rule. Follow the light.</Text>
    <Text style={[styles.caption, { color: t.textMuted }]}>PLAY LAB · Five rounds · Local demo</Text>
    <Text style={[styles.body, { color: t.textPrimary }]}>Play locally →</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 20, gap: 12, minHeight: 160 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: 1 },
  body: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 18 },
});
