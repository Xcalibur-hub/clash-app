// Execute the actual service and selector with a stateful client double, then
// render the actual selection grid using existing React Native Web primitives.
const fs=require('node:fs'),Module=require('node:module'),babel=require('@babel/core'),assert=require('node:assert/strict');
const React=require('react'),RN=require('react-native-web'),{renderToStaticMarkup}=require('react-dom/server');
for(const ext of ['.ts','.tsx']) Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
  filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
let uid='account-a',response={topicIds:['film','sport','technology'],version:1,revision:2,skipped:false},error=null,captured,calls=0,switchOnResponse=false;
const client={rpc(name,args){assert.equal(this,client);captured={name,args};calls++;return{abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(switchOnResponse)uid='account-b';return Promise.resolve({data:response,error});}};}};
const original=Module._load;let theme;
Module._load=function(request,parent){
  if(request==='react-native')return RN;
  if(request==='react-native-reanimated')return{__esModule:true,default:{View:RN.View},FadeIn:{duration(){return{reduceMotion(){return{};}};}},ReduceMotion:{System:'system'}};
  const file=Module._resolveFilename(request,parent).replaceAll('\\','/');
  if(file.endsWith('/services/supabaseClient.ts'))return{requireSupabase:()=>client,currentUserId:async()=>uid,requestError:e=>Object.assign(new Error(e.message),{code:e.code}),SupabaseError:class extends Error{constructor(message,code){super(message);this.code=code;}}};
  if(file.endsWith('/utils/haptics.ts'))return{tap(){}};
  if(theme&&file.endsWith('/theme/index.ts'))return theme;
  return original.apply(this,arguments);
};
async function main(){
  theme={...require('../theme/layout.ts'),...require('../theme/typography.ts'),...require('../theme/colors.ts')};theme.useThemeColors=()=>require('../theme/palettes.ts').darkTheme;
  const service=require('../services/arenaInterestService.ts');
  assert.equal((await service.saveMyArenaInterests(['film','sport','technology'],false,1,'account-a')).revision,2);
  assert.deepEqual(captured.args,{p_topic_ids:['film','sport','technology'],p_skip:false,p_expected_revision:1});
  assert.ok(!('user_id' in captured.args));console.log('PASS saves revision without accepting owner ID');
  error={code:'PT409',message:'Changed'};await assert.rejects(service.saveMyArenaInterests(['film','sport','technology'],false,1,'account-a'),{code:'PT409'});console.log('PASS concurrent-save conflict propagates');
  error={code:'network',message:'Offline'};await assert.rejects(service.saveMyArenaInterests([],true,1,'account-a'),{code:'network'});console.log('PASS failed save remains failed');error=null;
  const before=calls;uid='account-b';await assert.rejects(service.saveMyArenaInterests([],true,1,'account-a'),{code:'account_changed'});assert.equal(calls,before);console.log('PASS switched account cannot submit old draft');
  uid='account-a';switchOnResponse=true;await assert.rejects(service.saveMyArenaInterests([],true,1,'account-a'),{code:'account_changed'});switchOnResponse=false;console.log('PASS late save response rejected after account switch');
  response={topicIds:[],version:0,revision:0,skipped:false};assert.equal((await service.fetchMyArenaInterests()).version,0);console.log('PASS new account state stays incomplete');
  response={topicIds:[],version:1,revision:1,skipped:true};assert.equal((await service.fetchMyArenaInterests()).version,1);console.log('PASS returning account skip is complete');
  response={topicIds:['film','film','sport'],version:1,revision:2,skipped:false};await assert.rejects(service.fetchMyArenaInterests());console.log('PASS malformed private response rejected');
  const {TopicSelection}=require('../components/onboarding/TopicSelection.tsx');
  const catalogue=Array.from({length:7},(_,i)=>({id:String(i),name:'Topic '+i,description:'Real catalogue description',icon:null,hoods:[]}));
  let selected;const tree=TopicSelection({catalogue,selected:[],onChange:ids=>selected=ids});tree.props.children[0].props.onPress();assert.deepEqual(selected,['0']);console.log('PASS actual card interaction selects interest');
  const html=renderToStaticMarkup(React.createElement(TopicSelection,{catalogue,selected:['0','1','2','3','4'],onChange(){}}));
  assert.equal((html.match(/role="checkbox"/g)||[]).length,7);
  const chosen=TopicSelection({catalogue,selected:['0','1','2','3','4'],onChange(){}}).props.children;
  assert.equal(chosen.filter(c=>c.props.accessibilityState.checked).length,5);assert.equal(chosen.filter(c=>c.props.disabled).length,2);console.log('PASS accessible checked state and sixth-selection restriction render');
  const locked=TopicSelection({catalogue,selected:[],disabled:true,onChange(){}}).props.children;assert.equal(locked.filter(c=>c.props.disabled).length,7);console.log('PASS save-in-flight disables every card');
  const {selectFeedForScope}=require('../store/selectors.ts');const now=Date.now(),a={id:'a',hood:'movies',authorId:'author',createdAt:now,expiresAt:now+10000,clashes:0,reactions:0},b={...a,id:'b',reactions:100},extra={...a,id:'extra',reactions:200};
  const state={takes:[a,b,extra],forYouTakeIds:['a','extra','b'],generalTakeIds:['a','b']};
  assert.deepEqual(selectFeedForScope(state,'for-you','all',now,new Set()).map(t=>t.id),['a','extra','b']);
  assert.deepEqual(selectFeedForScope(state,'popular','all',now,new Set()).map(t=>t.id),['b','a']);
  assert.equal(selectFeedForScope(state,'following','all',now,new Set(['author'])).length,2);
  assert.deepEqual(selectFeedForScope(state,'new','all',now,new Set()).map(t=>t.id),['a','b']);console.log('PASS For You preserves server order and other scopes keep original batch');
  console.log('12/12 interest client/render checks passed; native animation is bridged, not device verification.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
