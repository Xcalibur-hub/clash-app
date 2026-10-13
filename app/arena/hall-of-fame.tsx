/** Arena V2 archive preview — real settled Clashes only; never invents winners. */
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchClashDiscovery } from '../../services/arenaClashDiscoveryService';
import { fetchClashViewForTake } from '../../services/clashEngineService';
import type { ClashDiscoveryEntry } from '../../utils/arenaClashDiscovery';
import { clashDiscoveryDestination } from '../../utils/arenaClashDiscovery';
import { useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';

type ArchiveEntry = { entry: ClashDiscoveryEntry; winner: 'A' | 'B' | 'DRAW' };
export default function HallOfFame(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = React.useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const entries = (await fetchClashDiscovery()).filter(
          (entry) => entry.kind === 'CLASH' && entry.status === 'settled',
        ).slice(0, 12);
        const settled = await Promise.all(entries.map(async (entry) => {
          try {
            const view = await fetchClashViewForTake(entry.takeId);
            if (!view?.verdict || view.status !== 'settled') return null;
            return { entry, winner: view.verdict.winnerSide };
          } catch { return null; }
        }));
        if (active) setRows(settled.filter((row): row is ArchiveEntry => row !== null));
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []));
  const dark = t.scheme === 'dark';
  const ink = dark ? '#FFF7EE' : '#28202C';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Arena"
        onPress={() => { tap(); router.back(); }} style={styles.back}>
        <Text style={{ color: t.textPrimary, fontWeight: '800' }}>←  ARENA</Text>
      </Pressable>
      <View style={[styles.hero, { backgroundColor: dark ? '#473659' : '#E9D8FF' }]}>
        <Text style={[styles.eyebrow, { color: ink }]}>THE ARENA ARCHIVE</Text>
        <Text allowFontScaling style={[styles.heading, { color: ink }]}>HALL OF{"\n"}FAME ✳</Text>
        <Text style={[styles.subtitle, { color: ink }]}>
          The debates that made it to a verdict.
        </Text>
      </View>
      <Text style={[styles.section, { color: t.textPrimary }]}>FINISHED CLASHES</Text>
      <Text style={{ color: t.textSecondary, lineHeight: 20 }}>
        A preview of your discoverable settled Clashes. A public, permanent Hall of Fame
        and official ranking criteria are not available yet.
      </Text>
      {loading ? <Text style={{ color: t.textMuted }}>Loading real results…</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: t.textPrimary }}>
        Couldn't load results. Return to Arena and try again.
      </Text> : null}
      {!loading && !error && rows.length === 0 ? (
        <Text style={{ color: t.textMuted }}>No settled results to display yet.</Text>
      ) : null}
      {rows.map(({ entry, winner }, index) => {
        const fill = winner === 'A'
          ? (dark ? '#46365D' : '#EAD9FF')
          : winner === 'B' ? (dark ? '#63434B' : '#FFD6C0')
            : (dark ? '#4A4341' : '#F8E3A1');
        return (
          <Pressable key={entry.id} accessibilityRole="button"
            accessibilityLabel={`View settled Clash: ${entry.title}`}
            onPress={() => { tap(); router.push(clashDiscoveryDestination(entry)); }}
            style={[styles.card, { backgroundColor: fill }]}>
            <Text style={[styles.eyebrow, { color: ink }]}>ARCHIVE / {String(index + 1).padStart(2, '0')}</Text>
            <Text style={[styles.cardTitle, { color: ink }]} numberOfLines={4}>{entry.title}</Text>
            <Text style={[styles.cardFoot, { color: ink }]}>
              {winner === 'DRAW' ? 'DRAW' : `SIDE ${winner} WON`}   ↗
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 15 },
  back: { minHeight: 44, justifyContent: 'center' },
  hero: { borderRadius: 28, padding: 24, minHeight: 225, justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  heading: { fontSize: 46, lineHeight: 49, fontWeight: '900', letterSpacing: -2 },
  subtitle: { fontSize: 14, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5, marginTop: 10 },
  card: { padding: 22, borderRadius: 24, gap: 14, minHeight: 160 },
  cardTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.7 },
  cardFoot: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
