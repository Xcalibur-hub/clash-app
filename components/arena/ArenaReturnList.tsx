import React from 'react';
import { Text, View } from 'react-native';
import { useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';
import { returnStateLabel, type ArenaReturnItem } from '../../utils/arenaReturnVisits';
import { ArenaButton, ArenaSurface } from './ui/ArenaPrimitives';

/** Pure presentation shared by Activity and the explicitly local demo. */
export function ArenaReturnList({ items, loading, error, coverage, onOpen, onRefresh, busy = false }: {
  items: readonly ArenaReturnItem[]; loading?: boolean; error?: string | null; coverage: string;
  onOpen: (item: ArenaReturnItem) => void; onRefresh: () => void; busy?: boolean;
}): React.JSX.Element {
  const t = useThemeColors(), [limit,setLimit] = React.useState(3);
  return <View style={{gap:10,paddingBottom:20}}>
    <Text style={[arena.type.meta,{color:t.textSecondary}]}>{coverage}</Text>
    {loading ? <Text accessibilityLiveRegion="polite" style={{color:t.textMuted}}>Loading recent Clashes…</Text> : error ? <View style={{gap:8}}><Text accessibilityRole="alert" style={{color:t.textSecondary}}>{error}</Text><ArenaButton label="Retry activity" onPress={onRefresh} /></View> : <>
      {items.length === 0 ? <Text style={[arena.type.body,{color:t.textSecondary}]}>No accessible Clashes in this recent window.</Text> : null}
      {items.slice(0,limit).map(item => <ArenaSurface key={item.id} style={{gap:8}}>
        <Text style={[arena.type.eyebrow,{color:t.textMuted}]}>{returnStateLabel[item.state]}</Text>
        {item.title ? <Text style={[arena.type.heading,{color:t.textPrimary,fontSize:17,lineHeight:23}]}>{item.title}</Text> : null}
        <Text style={[arena.type.meta,{color:t.textSecondary}]}>{item.basis}</Text>
        <ArenaButton disabled={busy} label={item.destination ? ['SETTLED','DRAW'].includes(item.state) ? 'View official result' : item.state === 'CANCELLED' ? 'View history' : 'Return to Clash' : 'Refresh activity'}
          accessibilityLabel={item.destination ? 'Return to Clash: '+item.title : 'Refresh unavailable Clash activity'} onPress={() => item.destination ? onOpen(item) : onRefresh()} />
      </ArenaSurface>)}
      {items.length > limit ? <ArenaButton label="Show more recent Clashes" variant="tertiary" onPress={() => setLimit(n=>n+3)} /> : null}
    </>}
  </View>;
}
