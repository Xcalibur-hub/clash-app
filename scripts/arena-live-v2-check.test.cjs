const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
const compile = f => babel.transformSync(fs.readFileSync(f,'utf8'), { filename:f, babelrc:false, configFile:false, presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'classic'}]], plugins:['@babel/plugin-transform-modules-commonjs'] }).code;
function deck(options = {}) {
  let clock = Date.now(), values = [], index = 0, accepted = 0, passed = 0, closed = 0, resolve, reject;
  const React = { createElement:(type,props,...children)=>({type,props:{...props,children}}), useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}];},useRef(initial){const i=index++;return values[i]??=( {current:initial} );},useEffect(){} };
  const current = {id:'pending',status:'PENDING',expiresAt:new Date(clock+60000).toISOString(),challenger:{name:'B',handle:'b'}};
  const FakeDate = class extends Date { static now(){return clock;} };
  const util = {exports:{}};vm.runInNewContext(compile('utils/arenaChallengePayload.ts'),{module:util,exports:util.exports,Date:FakeDate});
  const module={exports:{}};
  vm.runInNewContext(compile('components/arena/FullScreenChallengeDeck.tsx'), {module,exports:module.exports,Set,require(name){
    if(name==='react')return React;
    if(name==='react-native')return {AccessibilityInfo:{announceForAccessibility(){}},Modal:'Modal',View:'View'};
    if(name==='react-native-reanimated')return {useReducedMotion:()=>true};
    if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:24,bottom:16})};
    if(name.endsWith('/useClock'))return {useClock:()=>clock};
    if(name.endsWith('/theme'))return {useThemeColors:()=>({background:'#000'})};
    if(name.endsWith('/arenaChallengePayload'))return util.exports;
    if(name==='./ChallengeInvitation')return {ChallengeInvitation:'Invitation'};
    if(name.endsWith('/ArenaPrimitives'))return {ArenaButton:'Button'};
    throw Error('Unexpected dependency '+name);
  }});
  const props={visible:true,challenges:[current],takeText:'Real source contract',onClose(){closed++},onAccept(){accepted++;return new Promise((a,b)=>{resolve=a;reject=b})},onPass(){passed++;return Promise.resolve()},...options};
  let tree;const render=()=>{index=0;tree=module.exports.FullScreenChallengeDeck(props);return tree;};
  const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props.children)];
  const invitation=()=>walk(render()).find(n=>n.type==='Invitation').props;
  return {props,current,invitation,render,finish:()=>resolve(),fail:()=>reject(Error('lost response')),advance:n=>{clock+=n},get counts(){return {accepted,passed,closed}},back:()=>render().props.onRequestClose()};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('double press and close stay guarded while actual acceptance callback is pending',async()=>{const d=deck();d.invitation().onAccept();d.invitation().onAccept();d.back();assert.equal(d.counts.accepted,1);assert.equal(d.counts.closed,0);assert.equal(d.invitation().busy,true);d.finish();await flush();assert.equal(d.invitation().busy,true);d.invitation().onAccept();assert.equal(d.counts.accepted,1);});
test('failed acceptance is not success; bounded retry is possible and errors are visible',async()=>{const d=deck();d.invitation().onAccept();d.fail();await flush();assert.match(d.invitation().error,/No success/);assert.equal(d.invitation().busy,false);d.invitation().onAccept();assert.equal(d.counts.accepted,2);d.finish();await flush();});
test('expiry while invitation is open vetoes both native actions without callback',()=>{const d=deck();const old=d.invitation();d.advance(61000);old.onAccept();old.onPass();assert.equal(d.counts.accepted,0);assert.equal(d.counts.passed,0);assert.equal(d.invitation().eligible,false);assert.equal(d.invitation().challenge.status,'PENDING','Local expiry must not rewrite the authoritative status');assert.match(d.invitation().error,/expired/);});
test('busy parent and nonpending status prevent decisions; pass never invokes accept',async()=>{const d=deck({busy:true});d.invitation().onAccept();assert.equal(d.counts.accepted,0);d.props.busy=false;d.current.status='CANCELLED';d.invitation().onAccept();assert.equal(d.counts.accepted,0);d.current.status='PENDING';d.invitation().onPass();await flush();assert.equal(d.counts.passed,1);assert.equal(d.counts.accepted,0);});
test('source eligibility and linked-room confirmation gates remain in connected parent',()=>{const s=fs.readFileSync('components/arena/TakeChallenges.tsx','utf8');assert.match(s,/takeChallengeIneligibility\(take\).*takeChallengeIneligibility\(source\)/);assert.match(s,/await resolveArenaChallenge\(ch.id, 'ACCEPT'\)/);assert.match(s,/linkedRoomAfterAccept\(result\)/);assert.match(s,/router.replace\(`\/arena\/room\/\$\{roomId\}`\)/);});
test('discovery uses one vertical virtualized owner; private assists leave official Stage',()=>{const discovery=fs.readFileSync('components/arena/ArenaClashes.tsx','utf8');assert.match(discovery,/entry.kind === 'CLASH' && entry.state === section/);assert.match(discovery,/initialNumToRender=\{4\}/);assert.match(fs.readFileSync('app/(tabs)/index.tsx','utf8'),/arenaMode === 'clashes' \? <View[\s\S]*?\{header\}<\/View> : <FlatList/);const room=fs.readFileSync('components/liveArena/DuelRoomExperience.tsx','utf8');assert.ok(room.indexOf('stageFooter={')<room.indexOf('assistOpen ? <ArenaSheet'));assert.doesNotMatch(room.slice(room.indexOf('stageFooter={'),room.indexOf('fighterComposer={')),/PrivateAssistPanel/);assert.match(room,/assistOpen \? <ArenaSheet/);});

test('demo keyboard avoids stale Android offsets, reserves composer room and hides scenario chrome',()=>{const demo=fs.readFileSync('components/dev/arenaDemo/DemoArena.tsx','utf8'),room=fs.readFileSync('components/liveArena/ImmersiveClash.tsx','utf8');assert.match(demo,/enabled=\{Platform.OS === 'ios' \|\| keyboardOpen\}/);assert.match(demo,/condensed=\{keyboardOpen\}/);assert.match(demo,/!keyboardOpen \? <>/);assert.match(room,/minHeight: 134, flexShrink: 0/);});
