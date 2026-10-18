import React from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useThemeColors } from '../../../theme';
import { arena } from '../../../theme/arena';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { LiveDuelCard } from '../../arena/LiveDuelCard';
import type { DemoState, Phase } from './model';

export function DemoLiveDiscovery({ state: s, onOpen, onChallenge }: { state: DemoState; onOpen: (id: string, phase: Phase) => void; onChallenge: () => void }): React.JSX.Element {
  const t = useThemeColors(), [filter, setFilter] = React.useState('For You'), [archive, setArchive] = React.useState(false);
  const indices = filter === 'Following' ? [1, 3] : [0, 1, 2, 3, 5, 6];
  return <FlatList data={indices} keyExtractor={i => String(i)} initialNumToRender={3} windowSize={5} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
    ListHeaderComponent={<View style={{ gap: 12 }}><Text style={[arena.type.eyebrow, { color: t.textMuted }]}>DEMO · SCRIPTED DISCOVERY</Text><Text accessibilityRole="header" style={[arena.type.statement, { color: t.textPrimary, fontSize: 30, lineHeight: 37 }]}>Find your next debate.</Text><Text style={[arena.type.body, { color: t.textSecondary }]}>Two perspectives. Your ringside seat.</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><ArenaButton label="Review demo invitation" onPress={onChallenge} /><ArenaButton label={archive ? 'On now' : 'Demo results'} variant="tertiary" onPress={() => setArchive(value => !value)} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['For You', 'Following', 'Discover'].map(value => <ArenaButton key={value} label={value} selected={filter === value} variant={filter === value ? 'secondary' : 'tertiary'} onPress={() => setFilter(value)} />)}</ScrollView><Text style={[arena.type.meta, { color: t.textMuted }]}>Filters, identities and audience counts are fictional demo data.</Text></View>}
    renderItem={({ item: index, index: position }) => <LiveDuelCard title={s.data.takes[index].take.text} state={archive ? 'SETTLED' : 'LIVE'} featured={position === 0 && !archive} fighters={s.data.authors.slice(0, 2)} audience={[42,18,6,0,12,8][position]} audienceLabel="simulated spectators · DEMO" onOpen={() => onOpen(s.data.takes[index].take.id, archive ? 'SETTLED' : position === 1 ? 'FINAL' : 'OPEN')} />} />;
}
