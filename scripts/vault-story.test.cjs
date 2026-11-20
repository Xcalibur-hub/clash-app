const test = require('node:test'), assert = require('node:assert/strict');
const { harness, text } = require('./ui-completion-harness.cjs');
const { React } = require('./arena-mounted-room.cjs');
const base = 'components/vault/story/';
const model = () => harness(base+'model.ts',{},()=>()=>null).load(base+'model.ts');
const constants = variant => ({__esModule:true,default:{expoConfig:{extra:{appVariant:variant}}}});
const common = {VaultActionButton:{VaultActionButton:'Button'},ThemeProvider:{PresentationThemeProvider:'Theme'},'expo-status-bar':{StatusBar:'StatusBar'}};
const button = (h,label) => h.nodes.find(n=>n.props?.label===label || n.props?.accessibilityLabel===label);
const press = (h,label) => h.act(async()=>{assert.ok(button(h,label),label);button(h,label).props.onPress();});
function reader() {
  let handler, removed=0, exits=0;
  const native={View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:s=>s},
    BackHandler:{addEventListener:(event,fn)=>{assert.equal(event,'hardwareBackPress');handler=fn;return{remove(){removed++;handler=undefined;}};}}};
  const h=harness(base+'StoryExperience.tsx',{onExit:()=>exits++,onTheme(){}},e=>e.StoryReader,{dependencies:{...common,
    'react-native':native,'expo-router':{useFocusEffect:fn=>React.useEffect(fn,[fn])}},setTimeout(){throw Error('Untimed story must not schedule timers');}});
  return {h,back:()=>h.act(async()=>{assert.equal(handler(),true);}),get removed(){return removed;},get exits(){return exits;}};
}
test('all eight paths reach three endings and every previous decision changes subsequent prose',()=>{
  const m=model(), endings=new Set(), second=new Set(), third=new Set();
  for(let path=0;path<8;path++){
    let s=m.storyStep(m.initialStory(),{type:'start'});
    for(let step=0;step<3;step++){
      const scene=m.storyScene(s);assert.equal(scene.options.length,2);assert.equal(new Set(scene.options).size,2);
      if(step===1)second.add(scene.body.join(''));if(step===2)third.add(scene.body.join(''));
      s=m.storyStep(Object.freeze(s),{type:'choose',run:s.run,step,option:(path>>(2-step))&1});
    }
    const scene=m.storyScene(s);endings.add(scene.id);assert.equal(scene.options.length,0);
    assert.ok(scene.consequence.length>20);assert.ok(scene.body.join('').length>200);
    assert.equal(scene.id,(path&1)?'guardian':path===0?'rescue':'echo');
  }
  assert.equal(second.size,2);assert.equal(third.size,4);assert.deepEqual([...endings].sort(),['echo','guardian','rescue']);
});
test('invalid/duplicate choices, stale branches and replay callbacks cannot advance the story',()=>{
  const m=model();let s=m.storyStep(m.initialStory(),{type:'start'});
  for(const option of [-1,2,NaN,0.1,'0',null])assert.equal(m.storyStep(s,{type:'choose',run:0,step:0,option}),s);
  const old={type:'choose',run:0,step:0,option:0};s=m.storyStep(s,old);assert.equal(m.storyStep(s,old),s);
  s=m.storyStep(s,{type:'back'});assert.deepEqual(s.choices,[]);assert.equal(m.storyStep(s,old),s);
  s=m.storyStep(s,{type:'choose',run:s.run,step:0,option:1});assert.equal(m.storyScene(s).id,'chamber-1');
  s=m.storyStep(s,{type:'reset'});assert.equal(s.started,true);assert.deepEqual(s.choices,[]);assert.equal(m.storyStep(s,old),s);
  s=m.storyStep(s,{type:'back'});assert.equal(s.started,false);assert.equal(m.storyStep(s,{type:'choose',run:s.run,step:0,option:0}),s);
});
test('mounted production Reader traverses every branch, all endings, replay and duplicate presses without services',async()=>{
  const r=reader(),h=r.h;try{await h.mount();await press(h,'Begin the story');
    for(let path=0;path<8;path++){
      for(let step=0;step<3;step++){
        const choices=h.nodes.filter(n=>n.type==='Pressable');assert.equal(choices.length,2);
        const action=choices[(path>>(2-step))&1].props.onPress;
        await h.act(async()=>{action();action();});
      }
      assert.match(text(h.tree),/TRANSMISSION COMPLETE/);assert.equal(h.nodes.filter(n=>n.type==='Pressable').length,0);
      assert.match(text(h.tree),(path&1)?/The Keeper of Orison/:path===0?/Two Voices, One Dawn/:/The Echo Arrives/);
      await press(h,'Replay from the beginning');assert.match(text(h.tree),/DECISION\s+1\s+OF 3/);
    }assert.deepEqual(h.calls,[]);
  }finally{await h.unmount();}assert.ok(r.removed>0);
});
test('hardware and visible Back undo the same decisions, discard futures and exit only at introduction',async()=>{
  const r=reader(),h=r.h;try{await h.mount();await press(h,'Begin the story');await press(h,'Record the transmission');
    await press(h,'Isolate the chamber');await press(h,'Stay and cut the uplink');await r.back();
    assert.match(text(h.tree),/03 \/ The last window/);await press(h,'Previous page');assert.match(text(h.tree),/02 \/ Someone/);
    await r.back();assert.match(text(h.tree),/01 \/ The voice/);await r.back();assert.ok(button(h,'Begin the story'));
    assert.equal(r.exits,0);await r.back();assert.equal(r.exits,1);
  }finally{await h.unmount();}
});
test('entry and direct route require dev JavaScript AND native dev identity; account change keys reset readers',async()=>{
  for(const dev of [false,true])for(const variant of [undefined,'preview','production','development']){
    global.__DEV__=dev;const dependencies={...common,'expo-constants':constants(variant),StoryExperience:{StoryExperience:'Story'}};
    const entry=harness(base+'StoryEntry.tsx',{},e=>e.StoryEntry,{dependencies});
    const route=harness('app/vault/story.tsx',{},e=>e.default,{dependencies});
    try{await entry.mount();await route.mount();const allowed=dev&&variant==='development';assert.equal(entry.tree!==null,allowed);assert.equal(route.tree.type==='Story',allowed);
      if(allowed){await press(entry,'Read The Last Signal local interactive story');assert.deepEqual(entry.calls,[['push','/vault/story']]);
        const key=route.tree.key;route.auth={...route.auth,user:{id:'other'}};await route.update();assert.notEqual(route.tree.key,key);
      }else{assert.match(text(route.tree),/development preview/);await press(route,'Back to Vault');assert.deepEqual(route.calls,[['replace','/(vault)']]);}
    }finally{await entry.unmount();await route.unmount();}
  }delete global.__DEV__;
});
test('scalable scrolling prose, 56dp choices, safe-area ownership, themes and both reduced-motion sources',async()=>{
  const r=reader(),h=r.h;try{await h.mount();await press(h,'Begin the story');
    for(const width of [320,360,430])for(const scheme of ['dark','light']){
      Object.assign(h.dimensions,{width,fontScale:1.3});Object.assign(h.colors,{scheme,textPrimary:scheme==='dark'?'#fff':'#111'});await h.update();
      const scroll=h.nodes.find(n=>n.type==='ScrollView');assert.ok(scroll);assert.equal(scroll.props.contentContainerStyle.maxWidth,680);
      const rootStyle=h.tree.props.style;assert.equal(rootStyle[1].paddingTop,24);assert.equal(rootStyle[1].paddingBottom,16);
      for(const n of h.nodes.filter(n=>n.type==='Text')){assert.notEqual(n.props.allowFontScaling,false);assert.equal(n.props.numberOfLines,undefined);}
      for(const n of h.nodes.filter(n=>n.type==='Pressable')){assert.equal(n.props.style[0].minHeight,56);assert.equal(n.props.accessibilityRole,'button');}
    }
    h.motion.reduced=false;await h.update();assert.ok(h.animations.some(a=>a[1]===180));
    const count=h.animations.length;h.motion.reduced=true;await h.update();assert.equal(h.animations.length,count);
    h.motion.reduced=false;await press(h,'Turn story motion off');const manual=h.animations.length;await h.update();assert.equal(h.animations.length,manual);
  }finally{await h.unmount();}
});
test('rerender retains local progress; exit/unmount and re-entry discard it with no scheduled work',async()=>{
  const r=reader(),h=r.h;try{await h.mount();await press(h,'Begin the story');await press(h,'Answer with your name');await h.update();assert.match(text(h.tree),/station knows your name/);}finally{await h.unmount();}
  const fresh=reader();try{await fresh.h.mount();assert.ok(button(fresh.h,'Begin the story'));}finally{await fresh.h.unmount();}
});
