/** Public Crowd presentation. Only server-authorized rows; no layout fixtures. */
import React from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import type { useArenaCrowd } from '../../hooks/useArenaCrowd';
import { validCrowdText, type CrowdMessage } from '../../utils/arenaCrowd';
import { crowdAtLiveEdge, crowdTimeLabel, crowdUnseenAfterArrival } from '../../utils/crowdPresentation';
import { crowdRowLabel } from './liveArenaStyles';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export type CrowdModel = ReturnType<typeof useArenaCrowd>;
export interface LiveCrowdLayerProps {
  subdued?: boolean; paddingBottom?: number; crowd?: CrowdModel;
  unavailableReason?: string;
  onReport?: (message: CrowdMessage) => void;
}
// This UUID is an idempotency nonce, never an identity or authorization token.
function requestKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c => {
    const n = Math.floor(Math.random()*16); return (c==='x' ? n : (n&3)|8).toString(16);
  });
}
export function LiveCrowdLayer({ subdued=false,paddingBottom=0,crowd,onReport,unavailableReason }: LiveCrowdLayerProps): React.JSX.Element {
  const t = useThemeColors(); const [draft,setDraft] = React.useState('');
  const [unseen,setUnseen] = React.useState(false);
  const pending = React.useRef<{ body: string; key: string } | null>(null);
  const list = React.useRef<FlatList<CrowdMessage>>(null); const atLatest = React.useRef(true);
  const userScrolled = React.useRef(false);
  const latest = crowd?.messages.at(-1)?.id;
  const observedLatest = React.useRef(latest);
  const canSend = Boolean(crowd?.context?.canSend);
  React.useEffect(() => {
    const changed = observedLatest.current !== latest; observedLatest.current = latest;
    setUnseen(previous => crowdUnseenAfterArrival({ atLiveEdge: atLatest.current, latestChanged: changed && Boolean(latest), unseen: previous }));
    if (!atLatest.current) return;
    // Virtualized rows need a layout pass before scrollToEnd can find their size.
    const timer = setTimeout(() => { if (atLatest.current) list.current?.scrollToEnd({animated:false}); },100);
    return () => clearTimeout(timer);
  },[latest]);
  const send = async () => {
    const body = draft.trim(); if (!crowd || !canSend || !validCrowdText(body) || crowd.sending) return;
    if (!pending.current || pending.current.body!==body) pending.current = { body,key:requestKey() };
    if (await crowd.send(body,pending.current.key)) { setDraft(''); pending.current = null; atLatest.current = true; }
  };
  return <View style={[styles.wrap,{ paddingBottom }]} accessibilityLabel="Live crowd">
    <View style={styles.heading}>
      <Text style={[styles.label,{color:t.textSecondary}]}>LIVE CROWD</Text>
      <Text accessibilityLiveRegion="polite" style={[styles.state,{color:t.textMuted}]}>
        {crowd?.connected ? 'Live' : crowd?.context ? 'Reconnecting…' : ''}
      </Text>
    </View>
    {crowd?.error ? <View style={styles.notice}><Text accessibilityRole="alert" style={{color:t.textSecondary}}>{crowd.error}</Text>
      <Pressable onPress={() => void crowd.refresh()} accessibilityRole="button" style={styles.hit}><Text style={{color:t.textPrimary}}>Retry</Text></Pressable>
    </View> : null}
    <FlatList ref={list} style={styles.stream} data={crowd?.messages ?? []} keyExtractor={row => row.id}
      initialNumToRender={15} maxToRenderPerBatch={12} windowSize={5}
      keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
      maintainVisibleContentPosition={{minIndexForVisible:0}}
      onScrollBeginDrag={() => { userScrolled.current = true; }}
      onScroll={event => { if (!userScrolled.current) return; const e=event.nativeEvent; const edge = crowdAtLiveEdge({ offsetY: e.contentOffset.y, layoutHeight: e.layoutMeasurement.height, contentHeight: e.contentSize.height }); atLatest.current = edge; if (edge) setUnseen(false); }}
      scrollEventThrottle={100}
      onContentSizeChange={() => { if(atLatest.current) list.current?.scrollToEnd({animated:false}); }}
      ListHeaderComponent={crowd?.hasOlder ? <Pressable disabled={crowd.olderBusy} accessibilityRole="button" style={styles.hit}
        onPress={() => { atLatest.current=false; void crowd.loadOlder(); }}><Text style={{color:t.textMuted}}>{crowd.olderBusy ? 'Loading…' : 'Load earlier chat'}</Text></Pressable> : null}
      ListEmptyComponent={<Text style={[styles.empty,{color:t.textMuted}]}>{unavailableReason ?? (crowd?.loading ? 'Loading Crowd…' : !crowd?.context ? (crowd ? 'Crowd chat is unavailable.' : 'Enter the Clash to read Crowd chat.') : 'No Crowd messages yet.')}</Text>}
      renderItem={({item}) => <View style={[styles.row,{borderBottomColor:t.border}]} accessibilityRole="text" accessibilityLabel={crowdRowLabel(item.author.handle, item.body)}>
        <View style={[styles.avatar,{backgroundColor:t.surfaceElevated}]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={{color:t.textSecondary,fontSize:11,fontWeight:'600'}}>{item.author.handle.slice(0,1).toUpperCase()}</Text></View>
        <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={[styles.name,{color:t.textSecondary}, Platform.OS === 'web' ? { overflowWrap: 'anywhere' } as TextStyle : null]}>@{item.author.handle}<Text style={{ color: t.textMuted }}> · {crowdTimeLabel(item.createdAt, Date.now())}</Text></Text><Text style={[styles.line,{color:subdued ? t.textSecondary : t.textPrimary}, Platform.OS === 'web' ? { overflowWrap: 'anywhere' } as TextStyle : null]}>{item.body}</Text></View>
        {onReport ? <Pressable onPress={() => onReport(item)} accessibilityRole="button" accessibilityLabel={`Report or block @${item.author.handle}`} style={styles.menu}><Text style={{color:t.textMuted}}>···</Text></Pressable> : null}
      </View>}/>
    {unseen ? <Pressable accessibilityRole="button" accessibilityHint="New Crowd messages are available. Scrolls to the newest message" style={[styles.latestButton,{borderColor:t.border,backgroundColor:t.surfaceElevated}]} onPress={() => { atLatest.current=true; setUnseen(false); list.current?.scrollToEnd({animated:false}); }}><Text style={{color:t.textPrimary}}>New messages ↓</Text></Pressable> : null}
    {crowd?.context ? canSend ? <View style={[styles.composer,{borderColor:t.border}]}>
      <TextInput value={draft} onChangeText={setDraft} placeholder="Message the Crowd" placeholderTextColor={t.textMuted}
        accessibilityLabel="Public Crowd message" accessibilityHint="Public message, visible to everyone in this Clash" multiline maxLength={500} editable={!crowd.sending} blurOnSubmit={false} returnKeyType="default"
        style={[styles.input,{color:t.textPrimary}]} />
      <Pressable disabled={crowd.sending || !validCrowdText(draft.trim())} accessibilityRole="button" accessibilityLabel="Send public Crowd message"
        onPress={() => void send()} style={[styles.sendButton,{backgroundColor:t.surfaceElevated,borderColor:t.border}]}><Text style={{color:t.textPrimary,opacity:validCrowdText(draft.trim()) ? 1 : 0.4}}>{crowd.sending ? 'Sending…' : 'Send'}</Text></Pressable>
    </View> : <Text style={[styles.empty,{color:t.textMuted}]}>Crowd chat is read-only.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap:{flex:1,minHeight:0,paddingHorizontal:layout.screenX,paddingTop:space.xs},
  heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  label:{...typeScale.caption,fontSize:11,fontWeight:'700'},state:{...typeScale.caption,fontSize:11},
  stream:{flex:1,minHeight:0},content:{paddingVertical:8,gap:4,flexGrow:1},
  avatar:{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},row:{flexDirection:'row',alignItems:'flex-start',gap:8,paddingVertical:8},line:{...typeScale.body,fontSize:13,lineHeight:19,minWidth:0},
  name:{fontWeight:'600',fontSize:11},menu:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  empty:{...typeScale.caption,paddingVertical:12},notice:{gap:4},hit:{minHeight:44,minWidth:44,justifyContent:'center',paddingHorizontal:8},
  latestButton:{alignSelf:'center',borderRadius:18,borderWidth:StyleSheet.hairlineWidth,minHeight:44,paddingHorizontal:14,justifyContent:'center'},
  sendButton:{minHeight:44,minWidth:62,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:StyleSheet.hairlineWidth},
  composer:{flexDirection:'row',alignItems:'center',borderTopWidth:StyleSheet.hairlineWidth,gap:8,paddingTop:space.xs},
  input:{flex:1,minHeight:44,maxHeight:92,fontSize:14,paddingVertical:8},
});
