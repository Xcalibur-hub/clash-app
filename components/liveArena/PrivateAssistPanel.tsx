import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../store/AuthProvider';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { useThemeColors, space } from '../../theme';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { incorporatePrivateAssist, listPrivateAssists, privateAssistMediaUrl, reportPrivateAssist, respondPrivateAssist,
  sendPrivateAssist, uploadPrivateAssistMedia, type PrivateAssist } from '../../services/arenaAssistService';
import { MediaViewer } from '../shared/MediaViewer';

export function PrivateAssistPanel({ roomId, duel, disabled, onPublished }: {
  roomId: string; duel: ArenaDuel; disabled: boolean; onPublished: () => Promise<void>;
}): React.JSX.Element | null {
  const {user}=useAuth();
  return <PrivateAssistBody key={`${roomId}:${user?.id??'guest'}`} roomId={roomId} duel={duel} disabled={disabled} onPublished={onPublished}/>;
}
function PrivateAssistBody({ roomId, duel, disabled, onPublished }: {
  roomId: string; duel: ArenaDuel; disabled: boolean; onPublished: () => Promise<void>;
}): React.JSX.Element | null {
  const t=useThemeColors(), {user}=useAuth(), picker=useMediaPicker();
  const account=user?.id;
  const fighter=['fighter_a','fighter_b'].includes(duel.viewerRelationship);
  const [open,setOpen]=React.useState(false),[side,setSide]=React.useState<'A'|'B'>('A');
  const [body,setBody]=React.useState(''),[picked,setPicked]=React.useState<PickedMedia|null>(null);
  const [uploaded,setUploaded]=React.useState<string|null>(null),[rows,setRows]=React.useState<PrivateAssist[]>([]);
  const [error,setError]=React.useState<string|null>(null),[busy,setBusy]=React.useState(false),[notice,setNotice]=React.useState('');
  const alive=React.useRef(true);
  const inFlight=React.useRef(false);
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  React.useEffect(()=>{
    if (!open || !fighter || !account) return;
    let active=true;
    const load=async()=>{try{const next=await listPrivateAssists(account,roomId);if(active){setRows(next);setError(null);}}catch{if(active){setRows([]);setError('Private inbox unavailable. Retry or reopen.');}}};
    void load();const timer=setInterval(()=>void load(),15000);
    return ()=>{active=false;clearInterval(timer);};
  },[open,fighter,account,roomId]);
  if (!account || duel.viewerRelationship==='staff') return null;
  const action=async(fn:()=>Promise<void>,refresh=true)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);setNotice('');
    try{await fn();if(alive.current && fighter && refresh){const next=await listPrivateAssists(account,roomId);if(alive.current)setRows(next);}}
    catch{if(alive.current)setError('Assist could not update. Check access or try again.');}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  };
  const button=(label:string,fn:()=>void,locked=false)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={locked||busy} onPress={fn} style={{padding:10,opacity:locked||busy?0.45:1}}><Text style={{color:t.textPrimary}}>{label}</Text></Pressable>;
  return <View style={{padding:space.sm,borderColor:t.border,borderWidth:1,borderRadius:12}}>
    {button(fighter?'Private assist inbox':'Send a private assist',()=>setOpen(v=>!v))}
    {open?<>
      <Text style={{color:t.textMuted}}>Only the selected fighter receives the assist. Publishing is their explicit choice.</Text>
      {fighter?<ScrollView style={{maxHeight:240}}>
        {rows.length===0&&!error?<Text style={{color:t.textMuted}}>No private assists.</Text>:null}
        {rows.map(row=><View key={row.id} style={{paddingVertical:10,borderBottomWidth:1,borderColor:t.border}}>
          <Text style={{color:t.textPrimary}}>{row.body}</Text>
          <Text style={{color:t.textMuted}}>{row.status}{row.mediaId?' · Private attachment':''}{row.publishedMessageId?' · Published':''}</Text>
          {row.mediaKind?<AssistAttachment account={account} assist={row}/>:null}
          {row.status==='PENDING'?<View style={{flexDirection:'row'}}>{button('Accept',()=>void action(()=>respondPrivateAssist(account,row.id,'ACCEPTED')),disabled)}{button('Reject',()=>void action(()=>respondPrivateAssist(account,row.id,'REJECTED')),disabled)}</View>:null}
          {row.status==='ACCEPTED'&&!row.publishedMessageId?button('Publish as my argument',()=>void action(async()=>{await incorporatePrivateAssist(account,roomId,row);await onPublished();}),disabled):null}
          {button('Report and hide',()=>void action(()=>reportPrivateAssist(account,row.id)))}
        </View>)}
        {rows.length>=30?button('Load older assists',()=>void action(async()=>{const older=await listPrivateAssists(account,roomId,rows.at(-1));if(alive.current)setRows(current=>[...current,...older.filter(a=>!current.some(b=>b.id===a.id))]);},false)):null}
      </ScrollView>:<>
        <View style={{flexDirection:'row'}}>{button(`${side==='A'?'✓ ':''}Fighter A`,()=>setSide('A'),disabled)}{button(`${side==='B'?'✓ ':''}Fighter B`,()=>setSide('B'),disabled)}</View>
        <TextInput accessibilityLabel="Private assist text" value={body} onChangeText={setBody} maxLength={500} multiline editable={!disabled&&!busy} style={{color:t.textPrimary,minHeight:55,borderWidth:1,borderColor:t.border,padding:8}} placeholder="A source, thought or helpful counterpoint" placeholderTextColor={t.textMuted}/>
        <View style={{flexDirection:'row'}}>{button('Attach photo',()=>void action(async()=>{const p=await picker.pickImage();if(p&&alive.current){setPicked(p);setUploaded(null);}}),disabled)}{button('Attach video',()=>void action(async()=>{const p=await picker.pickVideo();if(p&&alive.current){setPicked(p);setUploaded(null);}}),disabled)}</View>
        {picked?<Text style={{color:t.textMuted}}>{picked.kind} attached privately</Text>:null}
        {button('Send privately',()=>void action(async()=>{let id=uploaded;if(picked&&!id){id=await uploadPrivateAssistMedia(account,picked);if(alive.current)setUploaded(id);}await sendPrivateAssist(account,roomId,side,body,id);if(alive.current){setBody('');setPicked(null);setUploaded(null);setNotice('Private assist sent.');}}),disabled||(!body.trim()&&!picked))}
      </>}
      {disabled?<Text style={{color:t.textMuted}}>Assist submissions and responses are closed.</Text>:null}
      {busy?<Text style={{color:t.textMuted}}>Updating…</Text>:null}
      {notice?<Text style={{color:t.textMuted}}>{notice}</Text>:null}
      {error?<Text accessibilityRole="alert" style={{color:t.textPrimary}}>{error}</Text>:null}
    </>:null}
  </View>;
}
function AssistAttachment({account,assist}:{account:string;assist:PrivateAssist}): React.JSX.Element|null {
  const t=useThemeColors();
  const [url,setUrl]=React.useState<string|null>(null);
  const [failed,setFailed]=React.useState(false);
  const alive=React.useRef(true);
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="View private attachment" onPress={()=>void privateAssistMediaUrl(account,assist).then(u=>{if(alive.current){setUrl(u);setFailed(false);}}).catch(()=>{if(alive.current)setFailed(true);})}><Text style={{color:t.textPrimary}}>View private {assist.mediaKind}</Text></Pressable>
    {failed?<Text accessibilityRole="alert" style={{color:t.textPrimary}}>Private attachment unavailable. Try again.</Text>:null}
    <MediaViewer visible={Boolean(url)} uri={url} kind={assist.mediaKind??'image'} onClose={()=>setUrl(null)}/>
  </>;
}
