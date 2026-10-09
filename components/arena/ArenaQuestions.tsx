import React from 'react';
import { Pressable,Text,View } from 'react-native';
import { useFocusEffect,useRouter } from 'expo-router';
import { fetchQuestionPage,type QuestionCursor } from '../../services/arenaQuestionService';
import { useAuth } from '../../store/AuthProvider';
import type { Take } from '../../store/types';
import { space,typeScale,useThemeColors } from '../../theme';
import { QuestionVotePanel } from './QuestionVotePanel';
export function ArenaQuestions({topicId,refreshToken=0}:{topicId?:string;refreshToken?:number}):React.JSX.Element {
 const t=useThemeColors(),router=useRouter(),{user}=useAuth();
 const [items,setItems]=React.useState<Take[]>([]),[cursor,setCursor]=React.useState<QuestionCursor|null>(null);
 const [loading,setLoading]=React.useState(true),[error,setError]=React.useState(false),[more,setMore]=React.useState(false);
 const generation=React.useRef(0),busy=React.useRef(false),boundAccount=React.useRef<string|null>(null);
 const currentAccount=user?.id??null,visibleItems=boundAccount.current===currentAccount?items:[];
 useFocusEffect(React.useCallback(()=>{
  const token=++generation.current;boundAccount.current=currentAccount;setItems([]);setCursor(null);setError(false);setLoading(Boolean(user));busy.current=false;setMore(false);
  if(user)void fetchQuestionPage(topicId).then(page=>{if(token===generation.current){setItems(page.items);setCursor(page.nextCursor);}})
   .catch(()=>{if(token===generation.current)setError(true);}).finally(()=>{if(token===generation.current)setLoading(false);});
  return ()=>{generation.current++;};
 },[topicId,user?.id,refreshToken]));
 const loadMore=async()=>{
  if(!cursor||busy.current)return;busy.current=true;setMore(true);setError(false);const token=generation.current;
  try {const page=await fetchQuestionPage(topicId,cursor);if(token===generation.current){
   if(page.nextCursor?.id===cursor.id&&page.nextCursor?.createdAt===cursor.createdAt)throw new Error('Question cursor did not advance');
   setItems(old=>[...new Map([...old,...page.items].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);
  }}catch{if(token===generation.current)setError(true);}finally{if(token===generation.current){busy.current=false;setMore(false);}}
 };
 return <View style={{gap:space.md}} accessibilityLabel="Arena questions">
  <Text style={{...typeScale.label,color:t.textPrimary}}>Questions {topicId?`· ${topicId.replaceAll('_',' ')}`:''}</Text>
  {!user?<Text style={{color:t.textMuted}}>Sign in to explore questions.</Text>:loading?<Text style={{color:t.textMuted}}>Loading questions…</Text>:null}
  {error?<Text accessibilityRole="alert" style={{color:t.textMuted}}>Questions could not update. Pull down to retry.</Text>:null}
  {user&&!loading&&!error&&!items.length?<Text style={{color:t.textMuted}}>No open questions here yet.</Text>:null}
  {visibleItems.map(take=><View key={take.id} style={{gap:space.sm}}>
   <Pressable accessibilityRole="button" accessibilityLabel={`Open discussion: ${take.text}`} onPress={()=>router.push('/take/'+take.id)} style={{minHeight:44,justifyContent:'center'}}>
    <Text style={{...typeScale.body,color:t.textPrimary}}>{take.text}</Text>
    <Text style={{...typeScale.caption,color:t.textSecondary}}>Open discussion</Text>
   </Pressable>
   {take.question?<QuestionVotePanel takeId={take.id} choices={take.question}/>:null}
  </View>)}
  {cursor&&boundAccount.current===currentAccount?<Pressable accessibilityRole="button" disabled={more} onPress={()=>void loadMore()} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:t.textPrimary}}>{more?'Loading…':'More questions'}</Text></Pressable>:null}
 </View>;
}
