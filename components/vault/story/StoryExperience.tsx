import React from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { PresentationThemeProvider } from '../../../theme/ThemeProvider';
import { useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';
import { initialStory, storyScene, storyStep } from './model';

export function StoryExperience({ onExit }: { onExit: () => void }): React.JSX.Element {
  const t = useThemeColors(), [scheme, setScheme] = React.useState<'dark' | 'light'>(t.scheme);
  return <PresentationThemeProvider scheme={scheme}><StoryReader onExit={onExit} onTheme={() => setScheme(s => s === 'dark' ? 'light' : 'dark')} /></PresentationThemeProvider>;
}
export function StoryReader({ onExit, onTheme }: { onExit: () => void; onTheme: () => void }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), systemReduced = useReducedMotion();
  const [state, dispatch] = React.useReducer(storyStep, undefined, initialStory);
  const [reduced, setReduced] = React.useState(false);
  const scroll = React.useRef<ScrollView>(null), scene = storyScene(state);
  const back = React.useCallback(() => {
    if (!state.started) onExit(); else dispatch({ type: 'back' });
  }, [state.started, onExit]);
  useFocusEffect(React.useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  }, [back]));
  React.useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [scene.id, state.run]);
  const ending = state.choices.length === 3;
  return <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
    <ScrollView ref={scroll} contentContainerStyle={styles.content}>
      <View style={styles.bar}>
        <VaultActionButton label={state.started ? 'Previous page' : 'Back to Vault'} onPress={back} tone="quiet" />
        <VaultActionButton label={t.scheme === 'dark' ? 'Light preview' : 'Dark preview'} onPress={onTheme} tone="quiet" />
      </View>
      <Text style={[styles.meta, { color: t.textMuted }]}>ORISON / STORY LAB / LOCAL ONLY</Text>
      {state.started ? <View accessible accessibilityLabel={ending ? 'Story complete. Three decisions made.' : `Decision ${state.choices.length + 1} of 3`}>
        <View style={styles.track}>{[0, 1, 2].map(i => <View key={i} style={[styles.segment, { backgroundColor: i < state.choices.length ? t.textPrimary : t.border }]} />)}</View>
        <Text style={[styles.meta, { color: t.textSecondary }]}>{ending ? 'TRANSMISSION COMPLETE' : `DECISION ${state.choices.length + 1} OF 3`}</Text>
      </View> : null}
      <Animated.View key={`${state.run}:${scene.id}`} entering={systemReduced || reduced ? undefined : FadeIn.duration(180)} style={styles.page}>
        {scene.consequence ? <Text accessibilityLiveRegion="polite" style={[styles.consequence, { color: t.textSecondary, borderColor: t.border }]}>{scene.consequence}</Text> : null}
        <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{scene.title}</Text>
        {scene.body.map((paragraph, i) => <Text key={i} style={[styles.prose, { color: t.textSecondary }]}>{paragraph}</Text>)}
        {scene.options.map((label, option) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
          onPress={() => dispatch({ type: 'choose', run: state.run, step: state.choices.length, option })}
          style={[styles.choice, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
          <Text style={[styles.choiceText, { color: t.textPrimary }]}>{label}</Text>
        </Pressable>)}
        {!state.started ? <VaultActionButton label="Begin the story" tone="solid" onPress={() => dispatch({ type: 'start' })} /> : null}
        {ending ? <>
          <Text style={[styles.prose, { color: t.textSecondary }]}>Three decisions. One possible ending. Revisit a decision or begin again to follow a different signal.</Text>
          <VaultActionButton label="Replay from the beginning" tone="solid" onPress={() => dispatch({ type: 'reset' })} />
          <VaultActionButton label="Return to Vault" onPress={onExit} />
        </> : null}
      </Animated.View>
      <Text style={[styles.meta, { color: t.textMuted }]}>No saved progress. Previous page discards the abandoned branch.</Text>
      <VaultActionButton label={reduced ? 'Turn story motion on' : 'Turn story motion off'} onPress={() => setReduced(v => !v)} tone="quiet" />
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, paddingBottom: 32, gap: 24, alignSelf: 'center', width: '100%', maxWidth: 680 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  page: { gap: 22 },
  title: { fontSize: 34, lineHeight: 43, fontWeight: '600', letterSpacing: -0.7 },
  prose: { fontSize: 17, lineHeight: 29 },
  meta: { fontSize: 11, lineHeight: 19, letterSpacing: 1.2 },
  consequence: { fontSize: 15, lineHeight: 24, borderLeftWidth: 2, paddingLeft: 16 },
  choice: { minHeight: 56, borderWidth: 1, borderRadius: 18, padding: 20, justifyContent: 'center' },
  choiceText: { fontSize: 16, lineHeight: 25, fontWeight: '600' },
  track: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segment: { flex: 1, height: 2 },
});
