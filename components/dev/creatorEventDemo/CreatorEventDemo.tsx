import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PresentationThemeProvider } from '../../../theme/ThemeProvider';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { useClock } from '../../../hooks/useClock';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { ArenaSheet } from '../../arena/ui/ArenaSheet';
import { Avatar } from '../../shared/Avatar';
import { EventStage } from './EventStage';
import { RoundDecision } from './RoundDecision';
import { appliedChoice, eventStep, initialEvent } from './model';

export function CreatorEventDemo({ onExit }: { onExit: () => void }): React.JSX.Element {
  const current = useThemeColors();
  const [scheme, setScheme] = React.useState<'dark' | 'light'>(current.scheme);
  return <PresentationThemeProvider scheme={scheme}><EventExperience onExit={onExit} onTheme={() => setScheme(value => value === 'dark' ? 'light' : 'dark')} /></PresentationThemeProvider>;
}
export function EventExperience({ onExit, onTheme }: { onExit: () => void; onTheme: () => void }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), now = useClock(1000);
  const [event, dispatch] = React.useReducer(eventStep, undefined, initialEvent);
  const [about, setAbout] = React.useState(false), [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => { if (event.phase === 'voting') dispatch({ type: 'tick', now }); }, [now, event.phase]);
  const winner = appliedChoice(event);
  const phases = { entry: 'BEFORE THE FIRST FOLD', voting: 'ROUND 01 · CHOOSE', closed: 'ROUND CLOSED', reveal: 'CHOICE → CONSEQUENCE', finished: 'EVENT FINISHED' };
  return <View style={{ flex: 1, backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.sm, paddingBottom: space.xl, paddingHorizontal: layout.screenX, gap: 20 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      <ArenaButton label="Back" variant="tertiary" onPress={onExit} />
      <ArenaButton label={t.scheme === 'dark' ? 'Light preview' : 'Dark preview'} variant="tertiary" onPress={onTheme} />
    </View>
    <Text style={[typeScale.caption, { color: t.textSecondary }]}>CREATOR EVENT DEMO · LOCAL ONLY</Text>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Avatar name="Isha" size={44} tint={t.textMuted} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={[typeScale.cardTitle, { color: t.textPrimary }]}>Isha · fictional demo host</Text>
        <Text style={[typeScale.meta, { color: t.textSecondary }]}>The Paper Lab</Text></View></View>
    <Text accessibilityRole="header" style={[event.phase === 'entry' ? typeScale.display : typeScale.title, { color: t.textPrimary }]}>{event.phase === 'entry' ? 'You choose.\nThe challenge changes.' : 'One round. Your direction.'}</Text>
    <Text style={[typeScale.body, { color: t.textSecondary }]}>{event.phase === 'entry' ? 'One sheet of paper. One local audience choice. No stream, remote voters or equipment connection.' : 'Local simulation. One ballot; no remote audience or stream.'}</Text>
    <Text accessibilityLiveRegion="polite" style={[typeScale.caption, { color: t.textPrimary }]}>{phases[event.phase]}</Text>
    <EventStage event={event} reduceMotion={reduceMotion} />
    {event.phase === 'entry' ? <ArenaButton label="Enter local event" variant="primary" onPress={() => dispatch({ type: 'enter', now: Date.now() })} /> : <>
      <View accessibilityLabel="Preview role" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ArenaButton label="Audience" selected={event.role === 'audience'} onPress={() => dispatch({ type: 'role', role: 'audience' })} />
        <ArenaButton label="Host controls" selected={event.role === 'host'} onPress={() => dispatch({ type: 'role', role: 'host' })} />
      </View>
      {event.phase === 'voting' || event.phase === 'closed' ? <RoundDecision event={event} now={now} dispatch={dispatch} /> : <View style={{ gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={[typeScale.title, { color: t.textPrimary }]}>{winner ? `Local outcome: ${winner.title}` : 'No winning choice'}</Text>
        <Text style={[typeScale.body, { color: t.textSecondary }]}>{winner ? 'One confirmed local ballot set the result. The illustration and challenge above have changed.' : 'No ballot was confirmed. No result or audience tally was invented.'}</Text>
        {event.phase === 'finished' ? <ArenaButton label="Replay local event" variant="primary" onPress={() => dispatch({ type: 'reset' })} /> : null}
      </View>}
      {event.role === 'host' ? <View style={{ gap: 8, borderTopWidth: 1, paddingTop: 16, borderColor: t.border }}>
        <Text style={[typeScale.meta, { color: t.textSecondary }]}>HOST PREVIEW · This device only</Text>
        {event.phase !== 'finished' ? <ArenaButton label={event.phase === 'voting' ? 'Close local round' : event.phase === 'closed' ? 'Reveal local outcome' : 'Finish local event'}
          onPress={() => dispatch({ type: 'advance', now: Date.now() })} /> : null}
        <ArenaButton label="Reset local event" variant="tertiary" onPress={() => dispatch({ type: 'reset' })} />
      </View> : null}
    </>}
    <ArenaButton label={reduceMotion ? 'Motion preview: reduced' : 'Reduce motion preview'} variant="tertiary" selected={reduceMotion} onPress={() => setReduceMotion(value => !value)} />
    <ArenaButton label="About this simulation" variant="tertiary" onPress={() => setAbout(true)} />
    {about ? <ArenaSheet title="A local rehearsal" onClose={() => setAbout(false)}><Text style={[typeScale.body, { color: t.textPrimary }]}>All choices stay in memory on this screen. Host controls advance only this illustration. Leaving or reloading discards the demo. There is no livestream, account action, server vote or hardware control. System reduced motion is always respected.</Text></ArenaSheet> : null}
  </ScrollView></View>;
}
