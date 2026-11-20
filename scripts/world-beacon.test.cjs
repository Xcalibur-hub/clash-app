const test=require('node:test'),assert=require('node:assert/strict');
const {harness,text,React}=require('./ui-completion-harness.cjs');
const base='components/world/beacon/';
const model=()=>harness(base+'model.ts',{},()=>()=>null).load(base+'model.ts');
const common={ArenaPrimitives:{ArenaButton:'Button'},ThemeProvider:{PresentationThemeProvider:'Theme'},'expo-status-bar':{StatusBar:'StatusBar'}};
const constants=variant=>({__esModule:true,default:{expoConfig:{extra:{appVariant:variant}}}});
const button=(h,label)=>h.nodes.find(n=>n.props?.label===label||n.props?.accessibilityLabel===label);
const press=(h,label)=>h.act(async()=>{const b=button(h,label);assert.ok(b,label);assert.ok(!b.props.disabled,label);b.props.onPress();});
function mission(){let handler,removed=0,exits=0;const native={View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:s=>s},
  BackHandler:{addEventListener:(e,fn)=>{assert.equal(e,'hardwareBackPress');handler=fn;return{remove(){removed++;handler=undefined;}};}}};
  const h=harness(base+'BeaconExperience.tsx',{onExit:()=>exits++,onTheme(){}},e=>e.BeaconMission,{dependencies:{...common,'react-native':native,'expo-router':{useFocusEffect:fn=>React.useEffect(fn,[fn])}},setTimeout(){throw Error('No expedition timers');}});
  return{h,back:()=>h.act(async()=>{assert.equal(handler(),true);}),get exits(){return exits;},get removed(){return removed;}};
}
function complete(m,order=['steps','house','loft'],all=true){let s=m.beaconStep(m.initialBeacon(),{type:'start'});for(const stop of order){s=m.beaconStep(s,{type:'visit',stop});for(const clue of m.CLUES.filter(c=>c.stop===stop&&(all||c.key)))s=m.beaconStep(s,{type:'inspect',run:s.run,clue:clue.id});s=m.beaconStep(s,{type:'back'});}return s;}
test('six visit orders collect the same real local records; optional clues alter the complete success account',()=>{
  const m=model();assert.equal(m.STOPS.length,3);assert.equal(m.CLUES.length,6);assert.equal(new Set(m.CLUES.map(c=>c.id)).size,6);
  for(const order of [['steps','house','loft'],['steps','loft','house'],['house','steps','loft'],['house','loft','steps'],['loft','house','steps'],['loft','steps','house']]){
    const s=complete(m,order);assert.equal(new Set(s.found).size,6);assert.ok(m.beaconReady(s));assert.equal(s.stop,null);
  }
  const full={...complete(m),outcome:'restored'},keyOnly={...complete(m,undefined,false),outcome:'restored'};
  assert.match(m.beaconOutcome(full).body,/complete record/);assert.doesNotMatch(m.beaconOutcome(keyOnly).body,/complete record/);
});
test('every inventory subset gates reconstruction on three specific evidence objects, never mere visits or counts',()=>{
  const m=model();for(let mask=0;mask<64;mask++){const found=m.CLUES.filter((_,i)=>mask&(1<<i)).map(c=>c.id),s={...m.initialBeacon(),phase:'field',found};
    const expected=['tide','notebook','dial'].every(c=>found.includes(c));assert.equal(m.beaconReady(s),expected);
    assert.equal(m.beaconStep(s,{type:'pulse'}).phase,expected?'complete':'field');
    if(!expected){assert.equal(m.beaconStep(s,{type:'beam'}),s);assert.equal(m.beaconStep(s,{type:'band'}),s);}
  }
});
test('all four beacon configurations produce deterministic outcomes; retry preserves evidence and replay discards it',()=>{
  const m=model();for(const beam of ['sea','refuge'])for(const band of ['blue','amber']){let s={...complete(m),beam,band};s=m.beaconStep(s,{type:'pulse'});
    assert.equal(s.outcome,beam==='sea'?'misdirected':band==='blue'?'silent':'restored');assert.notEqual(m.beaconOutcome(s).title,'No transmission yet');
    assert.equal(m.beaconStep(s,{type:'pulse'}),s);const retry=m.beaconStep(s,{type:'back'});assert.equal(retry.phase,'field');assert.deepEqual(retry.found,s.found);assert.equal(retry.beam,beam);
    const reset=m.beaconStep(s,{type:'reset'});assert.deepEqual(reset.found,[]);assert.equal(reset.phase,'field');assert.equal(reset.run,s.run+1);assert.equal(reset.beam,'sea');assert.equal(reset.band,'blue');
  }
  assert.equal(m.beaconOutcome(m.initialBeacon()).title,'No transmission yet');
});
test('invalid visits, wrong-stop inspections, repeated objects and stale-run callbacks cannot fabricate evidence',()=>{
  const m=model();let s=m.initialBeacon();assert.equal(m.beaconStep(s,{type:'visit',stop:'steps'}),s);s=m.beaconStep(s,{type:'start'});
  assert.equal(m.beaconStep(s,{type:'visit',stop:'not-a-place'}),s);assert.equal(m.beaconStep(s,{type:'inspect',run:0,clue:'tide'}),s);
  s=m.beaconStep(s,{type:'visit',stop:'steps'});for(const clue of ['dial','missing',null,1])assert.equal(m.beaconStep(s,{type:'inspect',run:s.run,clue}),s);
  const old={type:'inspect',run:s.run,clue:'tide'};s=m.beaconStep(Object.freeze(s),old);assert.equal(m.beaconStep(s,old),s);assert.equal(m.beaconStep(s,{type:'pulse'}),s);
  s=m.beaconStep(s,{type:'reset'});s=m.beaconStep(s,{type:'visit',stop:'steps'});assert.equal(m.beaconStep(s,old),s);assert.deepEqual(s.found,[]);
});
test('actual Mission and Field callbacks investigate all stops, preserve the record, fail honestly, reconstruct and replay',async()=>{
  const r=mission(),h=r.h,m=model(),field=harness(base+'BeaconField.tsx',{},e=>e.BeaconField,{dependencies:common});
  const props=()=>h.nodes.find(n=>n.type?.name==='BeaconField').props;
  const sync=()=>field.update(props());
  try{await h.mount();await press(h,'Start local expedition');assert.equal(button(h,'Test local beacon').props.disabled,true);
    for(const stop of ['loft','steps','house']){await sync();const name=m.STOPS.find(p=>p.id===stop).name;await h.act(async()=>button(field,`Investigate ${name}, 0 of 2 traces recorded`).props.onPress());await sync();
      for(const c of m.CLUES.filter(c=>c.stop===stop)){const fn=button(field,c.action).props.onPress;await h.act(async()=>{fn();fn();});await sync();assert.equal(button(field,'Recorded: '+c.title).props.disabled,true);assert.match(text(field.tree),new RegExp(c.title));}
      await h.act(async()=>button(field,'Return to island').props.onPress());
    }
    assert.equal(props().state.found.length,6);assert.equal(button(h,'Test local beacon').props.disabled,false);
    await press(h,'Test local beacon');assert.match(text(h.tree),/Light over deep water/);await press(h,'Revisit the evidence');assert.equal(props().state.found.length,6);
    await press(h,'Turn beam: sea approach');await press(h,'Test local beacon');assert.match(text(h.tree),/The right path, no reply/);await r.back();
    await press(h,'Tune band: blue');await press(h,'Test local beacon');assert.match(text(h.tree),/A light at the refuge/);assert.match(text(h.tree),/complete record/);
    await press(h,'Replay expedition');assert.deepEqual(props().state.found,[]);assert.equal(props().state.band,'blue');assert.deepEqual(h.calls,[]);assert.deepEqual(field.calls,[]);
  }finally{await field.unmount();await h.unmount();}assert.ok(r.removed>0);
});
test('hardware Back returns from a stop/result and exits the island; remount resets, rerender retains mounted progress',async()=>{
  const r=mission(),h=r.h;try{await h.mount();await press(h,'Start local expedition');let p=h.nodes.find(n=>n.type?.name==='BeaconField').props;
    await h.act(async()=>p.act({type:'visit',stop:'steps'}));await h.update();assert.equal(h.nodes.find(n=>n.type?.name==='BeaconField').props.state.stop,'steps');
    await r.back();assert.equal(h.nodes.find(n=>n.type?.name==='BeaconField').props.state.stop,null);assert.equal(r.exits,0);await r.back();assert.equal(r.exits,1);
  }finally{await h.unmount();}const fresh=mission();try{await fresh.h.mount();assert.ok(button(fresh.h,'Start local expedition'));}finally{await fresh.h.unmount();}
});
test('both public entry and direct route require dev JS AND native dev identity; account/guest identities key local reset',async()=>{
  for(const dev of [false,true])for(const variant of [undefined,'production','preview','development']){global.__DEV__=dev;const dependencies={...common,'expo-constants':constants(variant),BeaconExperience:{BeaconExperience:'Mission'}};
    const entry=harness(base+'BeaconEntry.tsx',{},e=>e.BeaconEntry,{dependencies}),route=harness('app/world/beacon.tsx',{},e=>e.default,{dependencies});
    try{await entry.mount();await route.mount();const allowed=dev&&variant==='development';assert.equal(entry.tree!==null,allowed);assert.equal(route.tree.type==='Mission',allowed);
      if(allowed){await press(entry,'Explore The Lost Beacon fictional local mission');assert.deepEqual(entry.calls,[['push','/world/beacon']]);const key=route.tree.key;route.auth={...route.auth,user:null};await route.update();assert.notEqual(route.tree.key,key);}
      else{assert.match(text(route.tree),/development preview/);await press(route,'Return to World');assert.deepEqual(route.calls,[['replace','/world']]);}
    }finally{await entry.unmount();await route.unmount();}
  }delete global.__DEV__;
});
test('illustration uses no geographic/location SDK; field targets, text, safe areas and both motion sources remain accessible',async()=>{
  const m=model(),r=mission(),h=r.h;const chart=harness(base+'BeaconChart.tsx',{state:m.initialBeacon()},e=>e.BeaconChart,{dependencies:{'react-native-svg':{__esModule:true,default:'Svg',Circle:'Circle',Path:'Path',Line:'Line'}}});
  const field=harness(base+'BeaconField.tsx',{state:complete(m),act(){}},e=>e.BeaconField,{dependencies:common});
  try{await chart.mount();assert.ok(chart.nodes.some(n=>n.props?.accessibilityLabel?.includes('not GPS')));assert.deepEqual(chart.calls,[]);
    await field.mount();for(const n of field.nodes.filter(n=>n.type==='Pressable')){assert.ok(n.props.style[0].minHeight>=56);assert.equal(n.props.accessibilityRole,'button');}
    await h.mount();for(const width of [320,360,430])for(const scheme of ['light','dark']){Object.assign(h.dimensions,{width,fontScale:1.3});h.colors.scheme=scheme;await h.update();assert.ok(h.nodes.some(n=>n.type==='ScrollView'));assert.equal(h.tree.props.style[1].paddingTop,24);assert.equal(h.tree.props.style[1].paddingBottom,16);for(const n of [...h.nodes,...field.nodes].filter(n=>n.type==='Text')){assert.notEqual(n.props.allowFontScaling,false);assert.equal(n.props.numberOfLines,undefined);}}
    h.motion.reduced=false;await h.update();assert.ok(h.animations.some(a=>a[1]===180));const count=h.animations.length;h.motion.reduced=true;await h.update();assert.equal(h.animations.length,count);
    h.motion.reduced=false;await press(h,'Turn expedition motion off');const manual=h.animations.length;await press(h,'Start local expedition');assert.equal(h.animations.length,manual);
  }finally{await field.unmount();await chart.unmount();await h.unmount();}
});
