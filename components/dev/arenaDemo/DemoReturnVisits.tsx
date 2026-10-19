import React from 'react';
import { Text, View } from 'react-native';
import { useThemeColors } from '../../../theme';
import { arena } from '../../../theme/arena';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { ArenaReturnList } from '../../arena/ArenaReturnList';
import { returnState, type ArenaReturnItem } from '../../../utils/arenaReturnVisits';
import type { DemoState, Phase } from './model';

export function DemoReturnVisits({state:s,onOpen,onClose}: {state:DemoState;onOpen:(id:string,phase:Phase)=>void;onClose:()=>void}): React.JSX.Element {
  const t=useThemeColors(),[settled,setSettled]=React.useState(false),[followed,setFollowed]=React.useState(false);
  const item=(index:number,state:ArenaReturnItem['state'],basis:string):ArenaReturnItem=>({id:s.data.takes[index].take.id,title:s.data.takes[index].take.text,state,destination:`/arena/room/demo-${index}`,basis:'DEMO · '+basis});
  const items: ArenaReturnItem[]=followed?[item(1,'FINAL','You follow this fictional public fighter')]:[
    item(0,returnState(settled?'settled':'open',settled?'closed':'open',settled?'A':null),'Scripted fighter history'),
    item(2,'DRAW','Scripted fighter history'),item(3,'CANCELLED','Scripted fighter history'),
    {id:'demo-unavailable-return',title:null,state:'UNAVAILABLE',destination:null,basis:'DEMO · No hidden title or identity'},
  ];
  return <View style={{padding:16,gap:12}}>
    <Text accessibilityRole="header" style={[arena.type.heading,{color:t.textPrimary}]}>DEMO · Return visits</Text>
    <Text style={[arena.type.body,{color:t.textSecondary}]}>Fictional local history and outcomes. Nothing is saved to a server.</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}><ArenaButton label="Back to demo discovery" onPress={onClose}/><ArenaButton label={followed?'Show demo fighter history':'Show demo followed activity'} variant="tertiary" onPress={()=>setFollowed(v=>!v)}/>{!followed?<ArenaButton label={settled?'Replay demo live state':'Simulate result arrival'} onPress={()=>setSettled(v=>!v)}/>:null}</View>
    <ArenaReturnList items={items} coverage={followed?'DEMO · Bounded followed-fighter snapshot, not complete history.':'DEMO · Own fighter history, not a watched-duel subscription.'}
      onRefresh={()=>{setSettled(false);setFollowed(false);}} onOpen={row=>onOpen(row.id,row.state==='SETTLED'?'SETTLED':row.state==='DRAW'?'DRAW':row.state==='CANCELLED'?'CANCELLED':row.state==='FINAL'?'FINAL':'OPEN')}/>
    <Text style={[arena.type.meta,{color:t.textSecondary}]}>Watched-duel subscriptions, community-linked duels and sender-owned assist recognition are unavailable in the production contracts. No demo community rivalry or public credit is invented.</Text>
  </View>;
}
