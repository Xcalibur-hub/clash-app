import React from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';
import { fetchOwnArenaReturns, fetchFollowedArenaReturns, fetchFollowedClashReturns, resolveArenaReturn } from '../../services/arenaReturnVisitService';
import type { ArenaReturnItem } from '../../utils/arenaReturnVisits';
import { ArenaButton } from './ui/ArenaPrimitives';
import { ArenaReturnList } from './ArenaReturnList';

export function ArenaReturnVisits({refreshToken = 0}: {refreshToken?: number}): React.JSX.Element | null {
  const {user} = useAuth(), owner = user?.id ?? null, t = useThemeColors(), router = useRouter();
  const [mode,setMode] = React.useState<'Your Clashes'|'Followed Clashes'|'Followed fighters'>('Your Clashes');
  const [retry,setRetry] = React.useState(0), [busy,setBusy] = React.useState(false), [openError,setOpenError] = React.useState('');
  const generation = React.useRef(0), opening = React.useRef(false);
  const [snapshot,setSnapshot] = React.useState<{owner:string;mode:string;items:ArenaReturnItem[];error:boolean;partial:boolean}|null>(null);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    const request = ++generation.current;
    setSnapshot(null); setBusy(false); setOpenError(''); opening.current = false;
    const current = (): boolean => active && request === generation.current;
    if (owner) void (async () => {
      try {
        const result = mode === 'Your Clashes' ? {items:await fetchOwnArenaReturns(owner,current),partial:false}
          : mode === 'Followed Clashes' ? {items:await fetchFollowedClashReturns(owner,current),partial:false}
          : await fetchFollowedArenaReturns(owner,current);
        if (current()) setSnapshot({owner,mode,...result,error:false});
      } catch { if (current()) setSnapshot({owner,mode,items:[],partial:false,error:true}); }
    })();
    return () => {active = false; generation.current++;};
  },[owner,mode,retry,refreshToken]));
  if (!owner) return null;
  const data = snapshot?.owner === owner && snapshot.mode === mode ? snapshot : null;
  const refresh = (): void => setRetry(n=>n+1);
  const open = async (item: ArenaReturnItem): Promise<void> => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setOpenError('');
    const request = generation.current;
    try {
      const next = await resolveArenaReturn(owner,item.id,()=>request===generation.current,mode==='Your Clashes');
      if (request !== generation.current) return;
      if (next.destination) router.push(next.destination);
      else {setOpenError('This Clash is no longer available. Refresh to update activity.');setSnapshot(previous=>previous?.owner===owner?{...previous,items:previous.items.map(row=>row.id===item.id?next:row)}:previous);}
    } catch {if (request===generation.current) {
      setOpenError('Couldn’t verify access. No navigation occurred. Refresh and try again.');
      setSnapshot(previous=>previous?.owner===owner?{...previous,items:previous.items.map(row=>row.id===item.id?{id:row.id,title:null,state:'ERROR',destination:null,basis:'Recent Clash'}:row)}:previous);
    }}
    finally {if (request===generation.current) {opening.current=false;setBusy(false);}}
  };
  return <View style={{gap:10,paddingBottom:16}}>
    <Text accessibilityRole="header" style={[arena.type.heading,{color:t.textPrimary}]}>Back to your Clashes</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>{(['Your Clashes','Followed Clashes','Followed fighters'] as const).map(value=><ArenaButton key={value} label={value} selected={mode===value} variant={mode===value?'secondary':'tertiary'} onPress={()=>setMode(value)} />)}<ArenaButton label="Refresh Clashes" variant="tertiary" onPress={refresh} /></View>
    {openError ? <Text accessibilityRole="alert" style={{color:t.textSecondary}}>{openError}</Text> : null}
    <ArenaReturnList key={owner+mode} loading={!data} items={data?.items??[]} busy={busy} error={data?.error?'Couldn’t load recent activity. These are not empty results.':null}
      coverage={mode==='Your Clashes'?'Up to 30 recent fighter Clashes. Watching is not a subscription.':mode==='Followed Clashes'?'Clashes you follow. Unfollowing removes a Clash from this list.':`Public followed fighters within the 60-record discovery snapshot.${data?.partial?' Some details could not be verified.':''}`}
      onOpen={item=>void open(item)} onRefresh={refresh} />
  </View>;
}
