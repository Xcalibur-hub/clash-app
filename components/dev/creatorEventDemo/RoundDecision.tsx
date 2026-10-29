import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { typeScale, useThemeColors } from '../../../theme';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { PAPER_OPTIONS, type DemoAction, type DemoEvent } from './model';

export function RoundDecision({ event, now, dispatch }: { event: DemoEvent; now: number; dispatch: React.Dispatch<DemoAction> }): React.JSX.Element {
  const t = useThemeColors(), open = event.phase === 'voting' && (event.closesAt ?? 0) > now;
  const locked = !open || event.role !== 'audience' || Boolean(event.ballot);
  const selected = PAPER_OPTIONS.find(option => option.id === event.ballot);
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={[typeScale.title, { color: t.textPrimary }]}>You set the challenge.</Text>
    {open ? <Text accessibilityLabel={`Local voting countdown: ${Math.min(45, Math.max(0, Math.ceil(((event.closesAt ?? now) - now) / 1000)))} seconds remaining`}
      style={[typeScale.dataLg, { color: t.textPrimary }]}>00:{String(Math.min(45, Math.max(0, Math.ceil(((event.closesAt ?? now) - now) / 1000)))).padStart(2, '0')} remaining</Text> : null}
    <View accessibilityLabel="Three local audience choices" style={{ gap: 8 }}>
      {PAPER_OPTIONS.map((option, index) => <Pressable key={option.id} accessibilityRole="radio"
        accessibilityLabel={option.title} accessibilityState={{ checked: event.selected === option.id, disabled: locked }} disabled={locked}
        onPress={() => dispatch({ type: 'select', choice: option.id, now: Date.now() })}
        style={[styles.option, { borderColor: event.selected === option.id ? t.textPrimary : t.border, backgroundColor: event.selected === option.id ? t.surfaceElevated : t.background }]}>
        <Text style={[typeScale.data, { color: t.textMuted }]}>{String(index + 1).padStart(2, '0')}</Text>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[typeScale.cardTitle, { color: t.textPrimary }]}>{option.title}</Text>
          <Text style={[typeScale.meta, { color: t.textSecondary }]}>{option.brief}</Text></View>
        <Text accessibilityElementsHidden style={{ color: t.textPrimary }}>{event.selected === option.id ? '●' : '○'}</Text>
      </Pressable>)}
    </View>
    {event.phase === 'voting' ? <ArenaButton label="Confirm local choice" variant="primary"
      disabled={locked || !event.selected} onPress={() => dispatch({ type: 'confirm', now: Date.now() })} /> : null}
    <Text accessibilityLiveRegion="polite" style={[typeScale.body, { color: t.textSecondary }]}>
      {event.phase !== 'voting' ? 'Round closed. No more choices can be recorded.' : selected ? `Local ballot confirmed: ${selected.title}. It cannot be changed this round.` : event.role === 'host' ? 'Host preview cannot vote. Switch to Audience to make the one local choice.' : 'Select an option, then confirm. Nothing is sent to a server.'}
    </Text>
    {(event.phase === 'closed') ? <Text style={[typeScale.meta, { color: t.textMuted }]}>Switch to Host controls to reveal the local outcome.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ option: { minHeight: 72, padding: 16, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 } });
