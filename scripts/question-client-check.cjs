// Actual services and question UI with controlled network/hooks; not device verification.
const fs=require('node:fs'),Module=require('node:module'),babel=require('@babel/core'),assert=require('node:assert/strict');
const React=require('react'),RN=require('react-native-web'),{renderToStaticMarkup}=require('react-dom/server');
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
 filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
let uid='a',response,error=null,captured,calls=0,lateSwitch=false,theme,focus;
const client={rpc(name,args){assert.equal(this,client);captured={name,args};calls++;return{abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(lateSwitch)uid='b';return Promise.resolve({data:response,error});}};}};
class ServiceError extends Error{constructor(message,code){super(message);this.code=code;}}
let cells=[],index=0,focusEffect,focusDeps,cleanup,timer,appCallback;
const hooks={...React,useState(value){const i=index++;if(!(i in cells))cells[i]=value;return[cells[i],next=>{cells[i]=typeof next==='function'?next(cells[i]):next;}];},
 useRef(value){const i=index++;if(!(i in cells))cells[i]={current:value};return cells[i];},useCallback(fn,deps){fn.dependencies=deps;return fn;}};
let server={takeId:'q',sideA:'Yes',sideB:'No',status:'open',expiresAt:'2026-10-10T00:00:00.123456Z',countA:0,countB:0,total:0,mySide:null,revision:0};
let panelError=null,voteCalls=[],deferredVote=null,pageResult,pageRequests=[],routes=[];
const panelApi={async fetchQuestion(){if(panelError)throw panelError;return {...server};},async voteQuestion(...args){voteCalls.push(args);if(deferredVote)return deferredVote;if(panelError)throw panelError;server={...server,mySide:args[1],revision:server.revision+1,countA:args[1]==='A'?1:0,countB:args[1]==='B'?1:0,total:1};return {...server};}};
const original=Module._load,originalInterval=global.setInterval,originalClear=global.clearInterval;
Module._load=function(request,parent){
 const file=parent.filename.replaceAll('\\','/');
 if(file.endsWith('/ArenaQuestions.tsx')){
  if(request==='react')return hooks;
  if(request==='expo-router')return{useFocusEffect(fn){focusEffect=fn;},useRouter:()=>({push:path=>routes.push(path)})};
  if(request.endsWith('/AuthProvider'))return{useAuth:()=>({user:uid?{id:uid}:null})};
  if(request.endsWith('/arenaQuestionService'))return{fetchQuestionPage(...args){pageRequests.push(args);return Promise.resolve(pageResult);}};
  if(request==='./QuestionVotePanel')return{QuestionVotePanel:RN.View};
 }
 if(file.endsWith('/QuestionVotePanel.tsx')){
  if(request==='react-native-reanimated')return{__esModule:true,default:{Text:RN.Text},useReducedMotion:()=>true};
  if(request==='react')return hooks;
  if(request==='react-native')return{...RN,AppState:{addEventListener(_event,fn){appCallback=fn;return{remove(){}};}}};
  if(request==='expo-router')return{useFocusEffect(fn){focusEffect=fn;}};
  if(request.endsWith('/AuthProvider'))return{useAuth:()=>({user:uid?{id:uid}:null})};
  if(request.endsWith('/useRequireAuth'))return{useRequireAuth:()=>()=>Boolean(uid)};
  if(request.endsWith('/arenaQuestionService'))return panelApi;
  if(request.endsWith('/PressableScale'))return{PressableScale:RN.Pressable};
 }
 if(request==='react-native')return RN;
 const resolved=Module._resolveFilename(request,parent).replaceAll('\\','/');
 if(resolved.endsWith('/services/supabaseClient.ts'))return{requireSupabase:()=>client,currentUserId:async()=>uid,requestError:e=>new ServiceError(e.message,e.code),SupabaseError:ServiceError};
 if(theme&&resolved.endsWith('/theme/index.ts'))return theme;
 return original.apply(this,arguments);
};
let passed=0;const pass=label=>{console.log('PASS '+label);passed++;};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(tree){if(!tree||typeof tree!=='object')return[];return[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];}
function textOf(tree){if(typeof tree==='string'||typeof tree==='number')return String(tree);return React.Children.toArray(tree?.props?.children).map(textOf).join(' ').replace(/\s+/g,' ').trim();}
(async()=>{
 theme={...require('../theme/layout.ts'),...require('../theme/typography.ts'),...require('../theme/colors.ts')};theme.useThemeColors=()=>require('../theme/palettes.ts').darkTheme;
 const api=require('../services/arenaQuestionService.ts');response={...server};
 assert.equal((await api.fetchQuestion('q')).total,0);pass('actual aggregate service retains honest empty counts');
 await api.voteQuestion('q','A',0,'a');assert.deepEqual(captured,{name:'vote_arena_question',args:{p_take_id:'q',p_side:'A',p_expected_revision:0,p_expected_auth_uid:'a'}});pass('vote sends revision and initiating-account assertion without author or totals');
 error={code:'network',message:'Response lost'};await assert.rejects(api.voteQuestion('q','A',0,'a'),{code:'network'});const first={...captured.args};error=null;await api.voteQuestion('q','A',0,'a');assert.deepEqual(captured.args,first);pass('lost-response service retry preserves exact intent');
 error={code:'P0006',message:'Changed'};await assert.rejects(api.voteQuestion('q','B',0,'a'),{code:'P0006'});error=null;pass('conflict remains an error');
 const before=calls;uid='b';await assert.rejects(api.voteQuestion('q','A',0,'a'),{code:'account_changed'});assert.equal(calls,before);pass('old account cannot replay vote');
 uid='a';lateSwitch=true;await assert.rejects(api.fetchQuestion('q','a'),{code:'account_changed'});lateSwitch=false;uid='a';pass('account switch rejects late network result');
 response={...server,total:99};await assert.rejects(api.fetchQuestion('q'));pass('malformed aggregate rejected');
 const row={id:'q',author_id:'author',hood:'techtakes',text:'A genuine question?',created_at:'2026-10-09T00:00:00Z',expires_at:server.expiresAt,reactions_count:0,clashes_count:0,question_a:'Yes',question_b:'No',question_origin:'human'};
 response=[row];assert.equal((await api.createQuestion(row.text,'techtakes','Yes','No','a')).question.sideB,'No');assert.equal(captured.args.p_media_object_id,null);pass('creation reuses Take mapper and existing media contract');
 const cursor={createdAt:'2026-10-09T00:00:00.123456Z',id:'q'};response={items:[row],nextCursor:cursor};const page=await api.fetchQuestionPage('technology',cursor);assert.equal(captured.args.p_cursor_at,cursor.createdAt);assert.equal(page.nextCursor.createdAt,cursor.createdAt);pass('precise bounded pagination retains PostgreSQL microseconds');
 response={items:Array(21).fill(row),nextCursor:cursor};await assert.rejects(api.fetchQuestionPage(),{code:'bad_payload'});pass('oversized question page rejected');
 global.setInterval=fn=>{timer=fn;return 1;};global.clearInterval=()=>{};
 const {QuestionVotePanel}=require('../components/arena/QuestionVotePanel.tsx');
 const choices={sideA:'Yes',sideB:'No',topicId:null,origin:'human',sourceUrl:null};
 const render=()=>{index=0;return QuestionVotePanel({takeId:'q',choices});};
 const activate=()=>{cleanup?.();focusDeps=focusEffect.dependencies;cleanup=focusEffect();};
 const side=(tree,name)=>nodes(tree).find(n=>n.props?.accessibilityLabel===`Side ${name}: ${choices[name==='A'?'sideA':'sideB']}`);
 let tree=render();assert.match(textOf(tree),/Loading votes/);activate();await flush();tree=render();assert.doesNotMatch(textOf(tree),/0%|participants|votes ·/);pass('actual panel loads without invented percentages before a vote');
 side(tree,'A').props.onPress();await flush();tree=render();assert.equal(side(tree,'A').props.accessibilityState.selected,true);assert.match(textOf(tree),/1 participant/);assert.match(textOf(tree),/100%/);pass('confirmed vote highlights server selection and authentic results');
 panelError=new ServiceError('Lost response','network');side(tree,'B').props.onPress();await flush();tree=render();assert.equal(side(tree,'A').props.accessibilityState.selected,true);assert.match(textOf(tree),/could not be confirmed/);
 const retry=nodes(tree).find(n=>textOf(n)==='Retry vote for Side B'&&n.props?.onPress);assert.ok(retry);const intent=voteCalls.at(-1);panelError=null;retry.props.onPress();await flush();tree=render();assert.deepEqual(voteCalls.at(-1),intent);assert.equal(side(tree,'B').props.accessibilityState.selected,true);pass('offline failure retains confirmed state and retries same side/revision');
 panelError=new ServiceError('Changed','P0006');side(tree,'A').props.onPress();await flush();tree=render();assert.match(textOf(tree),/Refresh before choosing/);assert.doesNotMatch(textOf(tree),/Retry vote for/);panelError=null;pass('conflicting vote requires fresh state');
 server={...server,status:'closed',countA:1,countB:1,total:2};appCallback('active');await flush();tree=render();assert.match(textOf(tree),/Tied/);assert.equal(side(tree,'A').props.disabled,true);pass('foreground reconciliation renders closed genuine tie and disables writes');
 server={...server,countA:0,countB:0,total:0,mySide:null,revision:0};timer();await flush();tree=render();assert.match(textOf(tree),/0 participants.*No votes/);assert.doesNotMatch(textOf(tree),/0%/);pass('closed empty history has no misleading percentages');
 panelError=new ServiceError('Hidden','42501');timer();await flush();tree=render();assert.match(textOf(tree),/Voting unavailable/);assert.doesNotMatch(textOf(tree),/participants/);panelError=null;pass('revoked access clears aggregate and selection');
 server={...server,status:'open'};timer();await flush();tree=render();let resolve;deferredVote=new Promise(r=>resolve=r);side(tree,'A').props.onPress();await flush();uid='b';tree=render();assert.doesNotMatch(textOf(tree),/Your choice|participants/);activate();await flush();resolve({...server,mySide:'A',revision:1,total:1,countA:1});await flush();tree=render();assert.equal(side(tree,'A').props.accessibilityState.selected,false);assert.doesNotMatch(textOf(tree),/Your choice/);pass('account switch mid-vote ignores former account result');
 const html=renderToStaticMarkup(tree);assert.match(html,/Casual A\/B question/);assert.equal((html.match(/role="button"/g)||[]).length,3);pass('actual card renders accessible choices and refresh control');
 server={...server,countA:1,countB:7,total:8,mySide:'A',revision:1};timer();await flush();tree=render();assert.match(textOf(tree),/13%/);assert.match(textOf(tree),/87%/);pass('two rounded option percentages sum to 100 without changing server counts');
 index=0;const editorial=QuestionVotePanel({takeId:'q',choices:{...choices,aiGenerated:true,context:'Neutral attributed context',sources:[{url:'https://news.example.org/story',title:'Real source headline',publisher:'Verified source'}]}});
 assert.match(textOf(editorial),/AI.*EDITORIAL/);assert.match(textOf(editorial),/Neutral attributed context/);assert.equal(nodes(editorial).filter(n=>n.props?.accessibilityRole==='link').length,1);pass('editorial card clearly labels AI context and accessible source link');
 cleanup?.();cleanup=null;cells=[];uid='a';
 const {ArenaQuestions}=require('../components/arena/ArenaQuestions.tsx');
 const question={id:'q1',text:'Real question one',question:choices},cursor1={createdAt:'2026-10-09T00:00:00.123456Z',id:'q1'};
 const renderPage=()=>{index=0;return ArenaQuestions({topicId:'technology'});};
 pageResult={items:[question],nextCursor:cursor1};tree=renderPage();activate();await flush();tree=renderPage();
 nodes(tree).find(n=>n.props?.accessibilityLabel==='Open discussion: Real question one').props.onPress();assert.deepEqual(routes,['/take/q1']);pass('actual question discussion links reuse Take route');
 pageResult={items:[question,{...question,id:'q2',text:'Real question two'}],nextCursor:null};nodes(tree).find(n=>n.props?.onPress&&textOf(n)==='More questions').props.onPress();await flush();tree=renderPage();
 assert.equal(nodes(tree).filter(n=>n.props?.accessibilityLabel?.startsWith('Open discussion:')).length,2);assert.deepEqual(pageRequests.at(-1),['technology',cursor1]);pass('overlapping pages deduplicate IDs and preserve precise continuation');
 uid='b';tree=renderPage();assert.doesNotMatch(textOf(tree),/Real question/);let resolvePage;pageResult=new Promise(r=>resolvePage=r);activate();uid='c';renderPage();activate();resolvePage({items:[question],nextCursor:null});cleanup();await flush();tree=renderPage();assert.doesNotMatch(textOf(tree),/Real question/);pass('account changes and disposal discard late question pages');
 cleanup=null;cells=[];pageResult={items:[],nextCursor:null};tree=renderPage();activate();await flush();tree=renderPage();assert.match(textOf(tree),/No open questions here yet/);pass('question discovery empty state reflects server data');
 cleanup?.();global.setInterval=originalInterval;global.clearInterval=originalClear;
 console.log(`${passed}/${passed} question service/interaction checks passed; controlled dependencies, not physical verification.`);
})().catch(e=>{global.setInterval=originalInterval;global.clearInterval=originalClear;cleanup?.();console.error(e);process.exitCode=1;});
