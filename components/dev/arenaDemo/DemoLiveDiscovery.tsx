import React from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useThemeColors } from '../../../theme';
import { arena } from '../../../theme/arena';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { LiveDuelCard } from '../../arena/LiveDuelCard';
import { rankLiveDiscovery, type LiveDiscoveryMode, type LiveDiscoveryDuel } from '../../../utils/personalizedLiveDiscovery';
import type { DemoState, Phase } from './model';

export function DemoLiveDiscovery({ state: s, onOpen, onChallenge }: { state: DemoState; onOpen: (id: string, phase: Phase) => void; onChallenge: () => void }): React.JSX.Element {
  const t = useThemeColors(), [filter, setFilter] = React.useState<LiveDiscoveryMode>('For You'), [archive, setArchive] = React.useState(false);
  const [scenario, setScenario] = React.useState<'Interests & follows' | 'Sparse interests' | 'No follows'>('Interests & follows');
  const indices = [0,1,2,3,5,6];
  const candidates: LiveDiscoveryDuel[] = indices.map((i, position) => ({
    entry: {id:`demo-clash-${i}`,takeId:s.data.takes[i].take.id,roomId:`demo-room-${i}`,title:s.data.takes[i].take.text,state:'LIVE',status:'open',kind:'CLASH'},
    hood:s.data.takes[i].take.hood, opensAt:s.now-position*60000, phase:position === 1 ? 'final_arguments' : 'open', identityHidden:false,
    fighters:[s.data.authors[i === 0 ? 0 : (i+2)%s.data.authors.length],s.data.authors[i === 0 ? 1 : (i+3)%s.data.authors.length]],
  }));
  const interestHood = candidates[0].hood;
  const signals = {interests:scenario === 'Sparse interests' || !interestHood ? [] : [{hood:interestHood,name:'Selected demo topic'}],followedIds:scenario === 'No follows' ? [] : [candidates[1].fighters![0]!.id]};
  const rows = rankLiveDiscovery(candidates,filter,signals);
  return <FlatList data={rows} keyExtractor={row => row.duel.entry.id} initialNumToRender={3} windowSize={5} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
    ListHeaderComponent={<View style={{ gap: 12 }}><Text style={[arena.type.eyebrow, { color: t.textMuted }]}>DEMO · SCRIPTED DISCOVERY</Text><Text accessibilityRole="header" style={[arena.type.statement, { color: t.textPrimary, fontSize: 22, lineHeight: 28 }]}>Find your next debate.</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><ArenaButton label="Review demo invitation" onPress={onChallenge} /><ArenaButton label={archive ? 'On now' : 'Demo results'} variant="tertiary" onPress={() => setArchive(value => !value)} /></View>
      <View style={{flexDirection:'row',flexWrap:'wrap'}}>{(['Interests & follows','Sparse interests','No follows'] as const).map(value => <ArenaButton key={value} label={value} selected={scenario === value} variant="tertiary" onPress={() => setScenario(value)} />)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{(['For You', 'Following', 'Discover'] as const).map(value => <ArenaButton key={value} label={value} accessibilityLabel={`Live filter: ${value}`} selected={filter === value} variant={filter === value ? 'secondary' : 'tertiary'} onPress={() => setFilter(value)} />)}</ScrollView><Text style={[arena.type.meta, { color: t.textMuted }]}>Fictional interests, follow relationships and duels · local only.</Text></View>}
    ListEmptyComponent={<Text style={[arena.type.body,{color:t.textSecondary}]}>No followed fighters in this demo snapshot. Following does not fill with unrelated duels.</Text>}
    renderItem={({ item: {duel,reason}, index: position }) => <LiveDuelCard title={duel.entry.title} state={archive ? 'SETTLED' : 'LIVE'} featured={position === 0 && !archive} phase={archive ? 'closed' : duel.phase} reason={reason} fighters={duel.fighters} onOpen={() => onOpen(duel.entry.takeId, archive ? 'SETTLED' : duel.phase === 'final_arguments' ? 'FINAL' : 'OPEN')} />} />;
}
