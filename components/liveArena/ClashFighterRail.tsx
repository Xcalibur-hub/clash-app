/** Exactly two canonical speakers; latest argument attribution is never a turn timer. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { sidePlateBorder, sidePlateFill } from './liveArenaStyles';
import { layout, useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';

export interface ClashFighterRailProps {
  duel: ArenaDuel; focusSide: 'A' | 'B' | null; condensed?: boolean; onOpenProfile?: (id: string) => void;
}
export function ClashFighterRail({ duel, focusSide, condensed = false, onOpenProfile }: ClashFighterRailProps): React.JSX.Element {
  const t = useThemeColors(), fighters = duelActiveSpeakers(duel);
  return <View style={styles.row} accessibilityLabel={`Fighters. ${fighters[0].name} versus ${fighters[1].name}`}>
    {fighters.map((fighter, i) => { const side = i === 0 ? 'A' : 'B', focused = focusSide === side; return <Pressable key={side} accessibilityRole="button" disabled={!onOpenProfile} accessibilityLabel={`${fighter.name}, Side ${side}${focused ? ', latest argument' : ''}`} accessibilityState={{selected:focused}} onPress={() => onOpenProfile?.(fighter.id)} style={[styles.fighter, { backgroundColor: sidePlateFill(fighter.tint ?? t.textMuted, t.scheme), borderColor: focused ? sidePlateBorder(fighter.tint ?? t.textMuted,t.scheme) : t.border }]}>
      <Avatar name={fighter.name} tint={fighter.tint ?? t.textMuted} size={condensed ? 24 : 32} />
      <View style={{flex:1,minWidth:0,gap:2}}><Text numberOfLines={2} style={[arena.type.label, {color:t.textPrimary,fontWeight:'600'}]}>{fighter.name}</Text><Text style={[arena.type.eyebrow, {color:t.textSecondary,fontSize:9}]}>SIDE {side}{focused ? ' · LATEST' : ''}</Text></View>
    </Pressable>; })}
  </View>;
}
const styles = StyleSheet.create({ row:{flexDirection:'row',gap:8,paddingHorizontal:layout.screenX},fighter:{flex:1,minWidth:0,minHeight:56,flexDirection:'row',alignItems:'center',gap:8,padding:8,borderWidth:StyleSheet.hairlineWidth,borderRadius:12} });
