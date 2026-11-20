import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PresentationThemeProvider } from '../../../theme/ThemeProvider';
import { useThemeColors } from '../../../theme';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { SignalBoard, SignalPattern } from './SignalBoard';
import { initialSignal, SIGNAL_PUZZLES, signalAccuracy, signalStep } from './model';

export function SignalGame({ onExit }: { onExit: () => void }): React.JSX.Element {
  const current = useThemeColors();
  const [scheme, setScheme] = React.useState<'light' | 'dark'>(current.scheme);
  return <PresentationThemeProvider scheme={scheme}><SignalExperience onExit={onExit} onTheme={() => setScheme(s => s === 'dark' ? 'light' : 'dark')} /></PresentationThemeProvider>;
}

export function SignalExperience({ onExit, onTheme }: { onExit: () => void; onTheme: () => void }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets();
  const [game, dispatch] = React.useReducer(signalStep, undefined, initialSignal);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const scroll = React.useRef<ScrollView>(null);
  const puzzle = SIGNAL_PUZZLES[game.round];
  const next = () => { dispatch({ type: 'next', run: game.run, round: game.round }); scroll.current?.scrollTo({ y: 0, animated: false }); };
  // Deliberately untimed: backgrounding retains this frame; leaving/unmounting discards the run.
  return <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
    <ScrollView ref={scroll} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <ArenaButton label="Back" variant="tertiary" onPress={onExit} />
        <ArenaButton label={t.scheme === 'dark' ? 'Light preview' : 'Dark preview'} variant="tertiary" onPress={onTheme} />
      </View>
      <Text style={[styles.meta, { color: t.textMuted }]}>PLAY LAB · LOCAL ONLY</Text>
      {game.phase === 'intro' ? <>
        <Text accessibilityRole="header" style={[styles.brand, { color: t.textPrimary }]}>SIGNAL</Text>
        <Text style={[styles.title, { color: t.textPrimary }]}>Find the rule. Follow the light.</Text>
        <View style={[styles.hero, { backgroundColor: t.surfaceElevated }]} accessibilityLabel="A light moves clockwise across three frames">
          {[1, 2, 8].map((mask, i) => <View key={mask} style={styles.heroFrame}><Text style={[styles.meta, { color: t.textMuted }]}>0{i + 1}</Text><SignalPattern mask={mask} size={2} /></View>)}
          <Text style={[styles.title, { color: t.textPrimary }]}>?</Text>
        </View>
        <Text style={[styles.body, { color: t.textSecondary }]}>Five visual patterns. Three possible signals. Each round adds a new rule to spot.</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>Play at your pace. One answer per round, then an explanation. No timer, saved score or rewards.</Text>
        <ArenaButton label="Start SIGNAL" variant="primary" onPress={() => dispatch({ type: 'start' })} />
      </> : game.phase === 'finished' ? <>
        <Text accessibilityRole="header" style={[styles.brand, { color: t.textPrimary }]}>Run complete.</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.result, { color: t.textPrimary }]}>{game.score} / {SIGNAL_PUZZLES.length}</Text>
        <Text style={[styles.title, { color: t.textPrimary }]}>{signalAccuracy(game)}% accuracy</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>Your local run covered orbit, growth, rotation, differences and two simultaneous rules. Replay the same patterns to practice; this is not a ranking.</Text>
        <ArenaButton label="Play SIGNAL again" variant="primary" onPress={() => { dispatch({ type: 'replay' }); scroll.current?.scrollTo({ y: 0, animated: false }); }} />
        <ArenaButton label="Return to Play" onPress={onExit} />
      </> : <>
        <View style={styles.top}><Text style={[styles.meta, { color: t.textSecondary }]}>ROUND {game.round + 1} / {SIGNAL_PUZZLES.length}</Text><Text style={[styles.meta, { color: t.textPrimary }]}>Score {game.score}</Text></View>
        <View style={styles.track}>{SIGNAL_PUZZLES.map((p, i) => <View key={p.id} style={[styles.segment, { backgroundColor: i <= game.round ? t.textPrimary : t.border }]} />)}</View>
        <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{puzzle.title}</Text>
        <SignalBoard key={`${game.run}:${game.round}`} puzzle={puzzle} answer={game.answer} reduceMotion={reduceMotion}
          onAnswer={option => dispatch({ type: 'answer', run: game.run, round: game.round, option })} />
        {game.phase === 'feedback' ? <ArenaButton label={game.round === SIGNAL_PUZZLES.length - 1 ? 'See local result' : 'Next signal'} variant="primary" onPress={next} /> : null}
      </>}
      <ArenaButton label={reduceMotion ? 'Turn motion on' : 'Turn motion off'} onPress={() => setReduceMotion(v => !v)} />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -1.5 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 24 },
  meta: { fontSize: 12, lineHeight: 18, letterSpacing: 1 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-around', padding: 24, gap: 16, borderRadius: 24 },
  heroFrame: { alignItems: 'center', gap: 18 },
  result: { fontSize: 64, lineHeight: 76, fontWeight: '800' },
  track: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
});
