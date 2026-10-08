/** Public Crowd presentation. Only server-authorized rows; no layout fixtures. */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { useArenaCrowd } from '../../hooks/useArenaCrowd';
import { validCrowdText, type CrowdMessage } from '../../utils/arenaCrowd';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export type CrowdModel = ReturnType<typeof useArenaCrowd>;
export interface LiveCrowdLayerProps {
  subdued?: boolean; paddingBottom?: number; crowd?: CrowdModel;
  onReport?: (message: CrowdMessage) => void;
}
// This UUID is an idempotency nonce, never an identity or authorization token.
function requestKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c => {
    const n = Math.floor(Math.random()*16); return (c==='x' ? n : (n&3)|8).toString(16);
  });
}
export function LiveCrowdLayer({ subdued=false,paddingBottom=0,crowd,onReport }: LiveCrowdLayerProps): React.JSX.Element {
  const t = useThemeColors(); const [draft,setDraft] = React.useState('');
  const [unseen,setUnseen] = React.useState(false);
  const pending = React.useRef<{ body: string; key: string } | null>(null);
  const list = React.useRef<FlatList<CrowdMessage>>(null); const atLatest = React.useRef(true);
  const userScrolled = React.useRef(false);
  const latest = crowd?.messages.at(-1)?.id;
  const canSend = Boolean(crowd?.context?.canSend);
  React.useEffect(() => {
    if (!atLatest.current) { setUnseen(true); return; }
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
      <Text style={[styles.label,{color:t.textSecondary}]}>CROWD · PUBLIC CHAT</Text>
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
      onScroll={event => { if (!userScrolled.current) return; const e=event.nativeEvent; atLatest.current=e.contentOffset.y+e.layoutMeasurement.height>=e.contentSize.height-40; if(atLatest.current)setUnseen(false); }}
      scrollEventThrottle={100}
      onContentSizeChange={() => { if(atLatest.current) list.current?.scrollToEnd({animated:false}); }}
      ListHeaderComponent={crowd?.hasOlder ? <Pressable disabled={crowd.olderBusy} accessibilityRole="button" style={styles.hit}
        onPress={() => { atLatest.current=false; void crowd.loadOlder(); }}><Text style={{color:t.textMuted}}>{crowd.olderBusy ? 'Loading…' : 'Load earlier chat'}</Text></Pressable> : null}
      ListEmptyComponent={<Text style={[styles.empty,{color:t.textMuted}]}>{crowd?.loading ? 'Loading Crowd…' : !crowd?.context ? (crowd ? 'Crowd chat is unavailable.' : 'Enter the Clash to read Crowd chat.') : 'No Crowd messages yet.'}</Text>}
      renderItem={({item}) => <View style={styles.row}>
        <Text style={[styles.line,{color:subdued ? t.textSecondary : t.textPrimary}]}>
          <Text style={styles.name}>@{item.author.handle}</Text>{'  '}{item.body}
        </Text>
        {onReport ? <Pressable onPress={() => onReport(item)} accessibilityRole="button" accessibilityLabel={`Report or block @${item.author.handle}`} style={styles.menu}><Text style={{color:t.textMuted}}>···</Text></Pressable> : null}
      </View>}/>
    {unseen ? <Pressable accessibilityRole="button" style={styles.hit} onPress={() => { atLatest.current=true; setUnseen(false); list.current?.scrollToEnd({animated:false}); }}><Text style={{color:t.textPrimary}}>Latest chat ↓</Text></Pressable> : null}
    {crowd?.context ? canSend ? <View style={[styles.composer,{borderColor:t.border}]}>
      <TextInput value={draft} onChangeText={setDraft} placeholder="Message the Crowd" placeholderTextColor={t.textMuted}
        accessibilityLabel="Public Crowd message" multiline maxLength={500} editable={!crowd.sending}
        style={[styles.input,{color:t.textPrimary}]} />
      <Pressable disabled={crowd.sending || !validCrowdText(draft.trim())} accessibilityRole="button" accessibilityLabel="Send public Crowd message"
        onPress={() => void send()} style={styles.hit}><Text style={{color:t.textPrimary,opacity:validCrowdText(draft.trim()) ? 1 : 0.4}}>{crowd.sending ? 'Sending…' : 'Send'}</Text></Pressable>
    </View> : <Text style={[styles.empty,{color:t.textMuted}]}>Crowd chat is read-only.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap:{flex:1,minHeight:0,paddingHorizontal:layout.screenX,paddingTop:space.xs},
  heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  label:{...typeScale.caption,fontSize:11,fontWeight:'700'},state:{...typeScale.caption,fontSize:11},
  stream:{flex:1,minHeight:0},content:{paddingVertical:8,gap:4,flexGrow:1},
  row:{flexDirection:'row',alignItems:'flex-start'},line:{...typeScale.body,fontSize:14,lineHeight:20,flex:1,paddingVertical:8},
  name:{fontWeight:'700',fontSize:13},menu:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  empty:{...typeScale.caption,paddingVertical:12},notice:{gap:4},hit:{minHeight:44,minWidth:44,justifyContent:'center',paddingHorizontal:8},
  composer:{flexDirection:'row',alignItems:'center',borderTopWidth:StyleSheet.hairlineWidth,gap:8},
  input:{flex:1,minHeight:44,maxHeight:92,fontSize:14,paddingVertical:8},
});
