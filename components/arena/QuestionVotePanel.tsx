import React from 'react';
import { AppState,Linking,Pressable,StyleSheet,Text,View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { fetchQuestion,voteQuestion } from '../../services/arenaQuestionService';
import { questionPercent,type QuestionChoices,type QuestionState } from '../../utils/arenaQuestions';
import { space,typeScale,useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import Animated,{FadeIn,useReducedMotion} from 'react-native-reanimated';

/** Aggregate-only casual voting. Never writes judgements, stances or Room state. */
export function QuestionVotePanel({takeId,choices}:{takeId:string;choices:QuestionChoices}):React.JSX.Element {
 const t=useThemeColors(),{user}=useAuth(),requireAuth=useRequireAuth();
 const reducedMotion=useReducedMotion();
 const account=user?.id??null,scope=`${account??'guest'}:${takeId}`;
 const [state,setState]=React.useState<QuestionState|null>(null),[loading,setLoading]=React.useState(true),[sending,setSending]=React.useState(false);
 const [error,setError]=React.useState<string|null>(null),[pending,setPending]=React.useState<{side:'A'|'B';revision:number}|null>(null);
 const current=React.useRef(''),generation=React.useRef(0),active=React.useRef(false),busy=React.useRef(false);
 const visible=current.current===scope?state:null;
 const refresh=React.useCallback(async()=>{
  if(!account||busy.current||!active.current)return;
  const token=++generation.current;
  try {const next=await fetchQuestion(takeId,account);if(active.current&&current.current===scope&&token===generation.current){setState(next);setLoading(false);setError(null);setPending(old=>old&&next.mySide===old.side?null:old);}}
  catch(e){if(active.current&&current.current===scope&&token===generation.current){
   if(['42501','account_changed'].includes((e as {code?:string})?.code??''))setState(null);
   setError('Voting could not update. Check your connection and retry.');setLoading(false);
  }}
 },[account,scope,takeId]);
 useFocusEffect(React.useCallback(()=>{
  active.current=true;current.current=scope;generation.current++;busy.current=false;setSending(false);setState(null);setPending(null);setError(null);setLoading(Boolean(account));
  void refresh();
  const timer=setInterval(()=>void refresh(),30000),listener=AppState.addEventListener('change',s=>{if(s==='active')void refresh();});
  return ()=>{active.current=false;generation.current++;clearInterval(timer);listener.remove();};
 },[scope,refresh,account]));
 const choose=async(side:'A'|'B',retryRevision?:number)=>{
  if(!requireAuth()||!account||!visible||busy.current||visible.status!=='open')return;
  busy.current=true;setSending(true);setError(null);
  const revision=retryRevision??visible.revision,token=++generation.current;
  setPending({side,revision});
  try {
   const next=await voteQuestion(takeId,side,revision,account);
   if(active.current&&current.current===scope&&generation.current===token){setState(next);setPending(null);}
  } catch(e){if(active.current&&current.current===scope&&generation.current===token){
   const code=(e as {code?:string})?.code;
   if(code==='42501'||code==='account_changed'){setState(null);setPending(null);}
   if(code==='P0006'||code==='P0003')setPending(null);
   setError(code==='P0006'?'Your vote changed elsewhere. Refresh before choosing again.':code==='P0003'?'Voting has closed. Refresh to see the final counts.':'Your vote could not be confirmed. Check your connection and retry.');
  }} finally {if(active.current&&current.current===scope&&generation.current===token){busy.current=false;setSending(false);}}
 };
 const closed=visible?.status==='closed',results=Boolean(visible&&(visible.mySide||closed));
 return <View style={[styles.wrap,{borderColor:t.border}]} accessibilityLabel="Casual A/B question">
  <Text style={[styles.caption,{color:t.textMuted}]}>{choices.aiGenerated?'AI · EDITORIAL A/B':choices.origin==='editorial'?'EDITORIAL A/B':'CASUAL A/B'} · Separate from Clash judging</Text>
  {choices.aiGenerated&&choices.context?<Text style={[styles.caption,{color:t.textSecondary}]}>{choices.context}</Text>:null}
  {choices.aiGenerated?choices.sources?.map(source=><Pressable key={source.url} accessibilityRole="link" accessibilityLabel={`Source: ${source.title}`} style={styles.retry}
   onPress={()=>{void Linking.openURL(source.url).catch(()=>setError('The source link could not open.'));}}><Text style={[styles.caption,{color:t.textSecondary}]}>Source · {source.publisher}</Text></Pressable>):null}
  {(['A','B'] as const).map(side=>{
   const label=side==='A'?(visible?.sideA??choices.sideA):(visible?.sideB??choices.sideB),selected=visible?.mySide===side;
   const count=side==='A'?visible?.countA:visible?.countB;
   const percent=visible&&visible.total>0?(side==='A'?questionPercent(visible.countA,visible.total):`${100-Math.round(100*visible.countA/visible.total)}%`):null;
   return <PressableScale key={side} accessibilityRole="button" accessibilityLabel={`Side ${side}: ${label}`}
    accessibilityState={{selected,disabled:(!visible&&Boolean(account))||sending||closed}}
    accessibilityHint={closed?'Voting has closed':selected?'Your confirmed choice. You can change sides while voting is open.':'Choose this side. Results appear after voting.'}
    disabled={(!visible&&Boolean(account))||sending||closed} onPress={()=>void choose(side)}
    style={[styles.choice,{borderColor:selected?t.textPrimary:t.border,backgroundColor:selected?t.surfaceMuted:'transparent'}]}>
    <Text style={[styles.caption,{color:t.textMuted}]}>OPTION {side}</Text>
    <Text style={[styles.label,{color:t.textPrimary}]}>{label}</Text>
    {selected?<Animated.Text entering={reducedMotion?undefined:FadeIn.duration(120)} style={[styles.caption,{color:t.textPrimary}]}>✓ Your choice</Animated.Text>:null}
    {results?<Text style={[styles.caption,{color:t.textSecondary}]}>{count} votes{percent?` · ${percent}`:''}</Text>:null}
   </PressableScale>;
  })}
  <Text accessibilityLiveRegion="polite" style={[styles.caption,{color:t.textMuted}]}>
   {!account?'Sign in to vote':loading?'Loading votes…':sending?'Confirming your vote…':!visible?'Voting unavailable':closed?'Voting closed':visible.mySide?'You can change sides while voting is open.':'Choose a side to see the results.'}
  </Text>
  {results&&visible?<Text style={[styles.caption,{color:t.textSecondary}]}>{visible.total} {visible.total===1?'participant':'participants'}{visible.total===0?' · No votes':visible.countA===visible.countB?' · Tied':''}</Text>:null}
  {error?<Text accessibilityRole="alert" style={[styles.caption,{color:t.textSecondary}]}>{error}</Text>:null}
  {pending&&error&&visible&&!closed?<Pressable accessibilityRole="button" disabled={sending} onPress={()=>void choose(pending.side,pending.revision)} style={styles.retry}><Text style={{color:t.textPrimary}}>Retry vote for Side {pending.side}</Text></Pressable>:null}
  {account?<Pressable accessibilityRole="button" disabled={sending} onPress={()=>{setError(null);void refresh();}} style={styles.retry}><Text style={{color:t.textSecondary}}>Refresh votes</Text></Pressable>:null}
 </View>;
}
const styles=StyleSheet.create({wrap:{marginHorizontal:space.md,padding:space.md,borderWidth:StyleSheet.hairlineWidth,borderRadius:18,gap:space.sm},
 choice:{padding:space.md,minHeight:52,borderWidth:StyleSheet.hairlineWidth,borderRadius:12,gap:space.xs},label:{...typeScale.body,fontWeight:'600'},caption:{...typeScale.caption},retry:{minHeight:44,justifyContent:'center'}});
