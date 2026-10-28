const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const babel=require('@babel/core');
function render({expanded=true,fighterComposer={fixture:'mounted draft'},fontScale=1,...props}={}){
  let dismissed=0;
  const React={useState:()=>[expanded,v=>{expanded=v;}],useRef:v=>({current:v}),useEffect:()=>{}};
  const jsx=(type,props)=>({type,props});
  const source=fs.readFileSync(path.resolve('components/liveArena/ImmersiveClash.tsx'),'utf8');
  const code=babel.transformSync(source,{filename:'ImmersiveClash.tsx',babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code;
  const module={exports:{}};
  const reanimated={View:'AnimatedView',Easing:{out:x=>x,cubic:0},FadeIn:{duration:()=>({})},useReducedMotion:()=>true,useSharedValue:v=>({value:v}),useAnimatedStyle:fn=>fn(),withTiming:v=>v};
  const rn={useWindowDimensions:()=>({width:412,height:891,fontScale,scale:2.625}),Keyboard:{dismiss:()=>{dismissed++;}},View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:x=>x,hairlineWidth:1}};
  const requireMock=name=>{
    if(name==='react')return {__esModule:true,default:React,...React};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return rn;
    if(name==='react-native-reanimated')return {__esModule:true,default:reanimated,...reanimated};
    if(name==='../../theme')return {useThemeColors:()=>({}),space:{},typeScale:{}};
    if(name==='../../utils/duelStageLayout'){
      const layout={exports:{}};
      const transformed=babel.transformSync(fs.readFileSync(path.resolve('utils/duelStageLayout.ts'),'utf8'),{filename:'duelStageLayout.ts',babelrc:false,configFile:false,presets:['@babel/preset-typescript'],plugins:['@babel/plugin-transform-modules-commonjs']}).code;
      new Function('module','exports',transformed)(layout,layout.exports);return layout.exports;
    }
    if(name==='../../utils/duelStageMotion')return {stageEntranceKey:()=> 'qa-stage'};
    if(name==='./liveArenaStyles')return {chipFill:()=> 'transparent'};
    return new Proxy({},{get:(_,key)=>key});
  };
  new Function('require','module','exports',code)(requireMock,module,module.exports);
  const fighter={name:'QA fighter'};
  const tree=module.exports.ImmersiveClash({duel:{clashId:'qa',fighterA:fighter,fighterB:fighter,status:'open'},condensed:true,fighterComposer,...props});
  const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(n.props){nodes.push(n);for(const v of Object.values(n.props))if(Array.isArray(v))v.forEach(walk);else walk(v);}}walk(tree);
  return {tree,nodes,state:()=>({expanded,dismissed})};
}
const flatten=style=>Object.assign({},...(Array.isArray(style)?style:[style]));
test('actual Stage focus handler dismisses Crowd IME and preserves mounted fighter composer',()=>{
  const {nodes,state}=render();const focus=nodes.find(n=>n.props.accessibilityLabel==='Focus official Stage');assert.ok(focus);
  assert.equal(nodes.filter(n=>n.props.children?.fixture==='mounted draft').length,1);
  focus.props.onPress();assert.equal(state().dismissed,1,'Stage focus must dismiss the Crowd keyboard');assert.equal(state().expanded,false);
});
test('collapsed judging Crowd reserves the supplied bottom inset when no fighter composer owns it',()=>{
  const {tree,nodes}=render({expanded:false,condensed:false,judgingFocus:true,fighterComposer:null,crowdPaddingBottom:48});
  assert.ok(nodes.some(n=>n.props.accessibilityLabel==='Expand Crowd conversation'));
  assert.equal(flatten(tree.props.style).paddingBottom,49);
});
test('collapsed active fighter leaves bottom inset ownership with its mounted composer',()=>{
  const {tree,nodes}=render({expanded:false,condensed:false,crowdPaddingBottom:48});
  assert.equal(flatten(tree.props.style).paddingBottom??0,0);
  assert.equal(nodes.filter(n=>n.props.children?.fixture==='mounted draft').length,1);
});
test('expanded and keyboard Crowd own their inset without root double-padding',()=>{
  for(const condensed of [false,true]){
    const {tree,nodes}=render({expanded:true,condensed,judgingFocus:true,fighterComposer:null,crowdPaddingBottom:condensed?4:48});
    assert.equal(flatten(tree.props.style).paddingBottom??0,0);
    const crowd=nodes.find(n=>n.type==='LiveCrowdLayer');assert.ok(crowd);
    assert.equal(crowd.props.paddingBottom,condensed?4:48);
  }
});
test('enlarged Stage puts outcome actions inside its scroll containment without duplicating them',()=>{
  const footer={fixture:'result actions'};
  const {nodes}=render({expanded:false,condensed:false,fontScale:1.3,fighterComposer:null,stageFooter:footer,crowdPaddingBottom:48});
  const scroll=nodes.find(n=>n.type==='ScrollView');assert.ok(scroll);
  assert.ok(scroll.props.children.includes(footer),'result actions must scroll with enlarged Stage text');
  assert.equal(flatten(scroll.props.contentContainerStyle).paddingBottom,96);
});
test('live action hosts stay pinned across font-scale changes',()=>{
  const footer={fixture:'live action state'};
  for(const fontScale of [1,1.3]){
    const {nodes}=render({expanded:false,condensed:false,fontScale,live:true,stageFooter:footer});
    const scroll=nodes.find(n=>n.type==='ScrollView');assert.ok(scroll);
    assert.equal(scroll.props.children.includes(footer),false);
    assert.ok(nodes.some(n=>n.props.accessibilityLabel==='Spectator stage actions'&&n.props.children.includes(footer)));
  }
});
