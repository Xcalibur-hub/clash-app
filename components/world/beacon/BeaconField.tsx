import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../../theme';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { CLUES, STOPS, type BeaconAction, type BeaconState } from './model';

export function BeaconField({ state, act }: { state: BeaconState; act: (action: BeaconAction) => void }): React.JSX.Element {
  const t = useThemeColors(), stop = STOPS.find(p => p.id === state.stop);
  if (stop) return <View style={styles.stack}>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{stop.name}</Text>
    <Text style={[styles.body, { color: t.textSecondary }]}>{stop.note}</Text>
    {CLUES.filter(c => c.stop === stop.id).map(clue => {
      const found = state.found.includes(clue.id);
      return <View key={clue.id} style={styles.stack}>
        <Pressable accessibilityRole="button" accessibilityLabel={found ? `Recorded: ${clue.title}` : clue.action}
          accessibilityState={{ disabled: found }} disabled={found} onPress={() => act({ type: 'inspect', clue: clue.id, run: state.run })}
          style={[styles.action, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
          <Text style={[styles.label, { color: t.textPrimary }]}>{found ? `Recorded: ${clue.title}` : clue.action}</Text>
          {!found ? <Text style={[styles.body, { color: t.textSecondary }]}>{clue.key ? 'Investigate the mechanism' : 'Examine another trace'}</Text> : null}
        </Pressable>
        {found ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: t.textSecondary }]}>{clue.detail}</Text> : null}
      </View>;
    })}
    <ArenaButton label="Return to island" onPress={() => act({ type: 'back' })} />
  </View>;
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Choose a place to investigate</Text>
    {STOPS.map((p, i) => {
      const clues = CLUES.filter(c => c.stop === p.id), count = clues.filter(c => state.found.includes(c.id)).length;
      return <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Investigate ${p.name}, ${count} of 2 traces recorded`}
        onPress={() => act({ type: 'visit', stop: p.id })} style={[styles.action, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text style={[styles.label, { color: t.textPrimary }]}>{i + 1} / {p.name}</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>{count} of 2 traces recorded</Text>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24 },
  label: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  action: { minHeight: 56, padding: 18, borderWidth: 1, borderRadius: 20, gap: 6 },
});
