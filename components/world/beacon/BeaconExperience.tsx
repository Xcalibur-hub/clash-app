import React from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { PresentationThemeProvider } from '../../../theme/ThemeProvider';
import { useThemeColors } from '../../../theme';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { BeaconChart } from './BeaconChart';
import { BeaconField } from './BeaconField';
import { beaconOutcome, beaconReady, beaconStep, CLUES, initialBeacon } from './model';

export function BeaconExperience({ onExit }: { onExit: () => void }): React.JSX.Element {
  const t = useThemeColors(), [scheme, setScheme] = React.useState<'dark' | 'light'>(t.scheme);
  return <PresentationThemeProvider scheme={scheme}><BeaconMission onExit={onExit} onTheme={() => setScheme(s => s === 'dark' ? 'light' : 'dark')} /></PresentationThemeProvider>;
}
export function BeaconMission({ onExit, onTheme }: { onExit: () => void; onTheme: () => void }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), systemReduced = useReducedMotion();
  const [state, act] = React.useReducer(beaconStep, undefined, initialBeacon);
  const [reduced, setReduced] = React.useState(false), scroll = React.useRef<ScrollView>(null);
  const back = React.useCallback(() => {
    if (state.stop || state.phase === 'complete') act({ type: 'back' }); else onExit();
  }, [state.stop, state.phase, onExit]);
  useFocusEffect(React.useCallback(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => sub.remove(); }, [back]));
  React.useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [state.stop, state.phase, state.run]);
  const keyCount = CLUES.filter(c => c.key && state.found.includes(c.id)).length, outcome = beaconOutcome(state);
  return <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
    <ScrollView ref={scroll} contentContainerStyle={styles.content}>
      <View style={styles.bar}>
        <ArenaButton label="Leave mission" variant="tertiary" onPress={onExit} />
        <ArenaButton label={t.scheme === 'dark' ? 'Light preview' : 'Dark preview'} variant="tertiary" onPress={onTheme} />
      </View>
      <Text style={[styles.meta, { color: t.textMuted }]}>WORLD LAB / FICTION / LOCAL ONLY</Text>
      <Animated.View key={`${state.run}:${state.phase}:${state.stop}`} entering={systemReduced || reduced ? undefined : FadeIn.duration(180)} style={styles.stack}>
        <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{state.phase === 'complete' ? outcome.title : 'The Lost Beacon'}</Text>
        <BeaconChart state={state} />
        {state.phase === 'intro' ? <>
          <Text style={[styles.body, { color: t.textSecondary }]}>The ferry light on Aster Reach has gone dark. Follow the keeper’s traces across an invented island and discover where the beacon should point.</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>Visit three places in any order. Examine objects, keep a clue record, then reconstruct the light. Nothing is sent, saved or awarded. No GPS is used.</Text>
          <ArenaButton label="Start local expedition" variant="primary" onPress={() => act({ type: 'start' })} />
        </> : state.phase === 'complete' ? <>
          <Text accessibilityLiveRegion="polite" style={[styles.body, { color: t.textSecondary }]}>{outcome.body}</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>Local simulation complete. {state.found.length} of 6 traces recorded. No real transmission or reward.</Text>
          <ArenaButton label="Revisit the evidence" onPress={() => act({ type: 'back' })} />
          <ArenaButton label="Replay expedition" variant="primary" onPress={() => act({ type: 'reset' })} />
          <ArenaButton label="Return to World" onPress={onExit} />
        </> : <>
          <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: t.textSecondary }]}>{keyCount} of 3 key clues / {state.found.length} of 6 traces recorded</Text>
          <BeaconField state={state} act={act} />
          {!state.stop ? <View style={styles.stack}>
            <Text accessibilityRole="header" style={[styles.heading, { color: t.textPrimary }]}>Reconstruct the beacon</Text>
            {beaconReady(state) ? <>
              <Text style={[styles.body, { color: t.textSecondary }]}>Use your recorded evidence to aim the light and tune its receiver. The island diagram follows the beam. A pulse tests your reconstruction locally.</Text>
              <ArenaButton label={`Turn beam: ${state.beam === 'sea' ? 'sea approach' : 'inland refuge'}`} onPress={() => act({ type: 'beam' })} />
              <ArenaButton label={`Tune band: ${state.band}`} onPress={() => act({ type: 'band' })} />
            </> : <Text style={[styles.body, { color: t.textSecondary }]}>Examine the tide plate, keeper notebook and relay dial before testing the light.</Text>}
            <ArenaButton label="Test local beacon" variant="primary" disabled={!beaconReady(state)} onPress={() => act({ type: 'pulse' })} />
          </View> : null}
          <View style={[styles.record, { borderColor: t.border }]}>
            <Text accessibilityRole="header" style={[styles.heading, { color: t.textPrimary }]}>Field record</Text>
            {state.found.length === 0 ? <Text style={[styles.body, { color: t.textSecondary }]}>No clues recorded in this local run. Choose an investigation stop to begin.</Text> : CLUES.filter(c => state.found.includes(c.id)).map(c => <View key={c.id} style={styles.stack}>
              <Text style={[styles.label, { color: t.textPrimary }]}>{c.title}</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>{c.detail}</Text>
            </View>)}
          </View>
        </>}
      </Animated.View>
      <Text style={[styles.meta, { color: t.textMuted }]}>Back returns from a stop/result to the island. Back on the island or introduction exits. Leaving discards this run.</Text>
      <ArenaButton label={reduced ? 'Turn expedition motion on' : 'Turn expedition motion off'} variant="tertiary" onPress={() => setReduced(v => !v)} />
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 22, width: '100%', maxWidth: 680, alignSelf: 'center' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  stack: { gap: 18 },
  title: { fontSize: 34, lineHeight: 43, fontWeight: '600' },
  heading: { fontSize: 23, lineHeight: 31, fontWeight: '600' },
  label: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 26 },
  meta: { fontSize: 12, lineHeight: 20 },
  record: { paddingTop: 20, borderTopWidth: 1, gap: 20 },
});
