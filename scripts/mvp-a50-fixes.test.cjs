// Actual production components/hooks; native windows, SDK and navigation are controlled boundaries.
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, React, nodes, text, deferred } = require('./ui-completion-harness.cjs');
const native = { ...Object.fromEntries(['View','Text','Pressable','ScrollView','FlatList','Modal','TextInput','KeyboardAvoidingView','ActivityIndicator'].map(k=>[k,k])),
  StyleSheet: { create: s=>s, absoluteFill:{}, hairlineWidth:1 }, Platform:{OS:'android',select:o=>o.android??o.default},
  AppState:{currentState:'active',addEventListener:()=>({remove(){}})} };
const leaf = name=>({[name]:name});
const node = (h,name)=>h.nodes.find(n=>(n.type?.name??n.type)===name);
const button = (h,label)=>h.nodes.find(n=>n.props.onPress&&(n.props.accessibilityLabel===label||text(n)===label));
function gate() {
  const focus=[], events=[]; const dispatch=e=>events.push(e); let path='/';
  const h=harness('components/onboarding/InterestOnboardingGate.tsx',{},undefined,{dependencies:{
    'react-native':{...native,findNodeHandle:v=>v?.handle??null,AccessibilityInfo:{setAccessibilityFocus:id=>focus.push(id)},
      BackHandler:{addEventListener(){assert.fail('Native Modal owns Android Back');}}},
    'expo-router':{useRouter:()=>h.router,usePathname:()=>path}, store:{useClash:()=>({dispatch}),markOnboarded:()=>({type:'saved'})},
    ArenaInterestEditor:{ArenaInterestEditor:'Editor'},OnboardingNextStep:{OnboardingNextStep:'Next'},
  }});
  h.services.fetchMyArenaInterests=async()=>({version:0});
  return {h,focus,events,path:p=>{path=p;}};
}
test('onboarding uses a native modal window and focuses an accessible heading on show',async()=>{
  const r=gate();try{await r.h.mount();assert.equal(r.h.tree.type,'Modal');assert.equal(r.h.tree.props.transparent,false);
    const heading=r.h.nodes.find(n=>n.props.accessibilityRole==='header');assert.equal(heading.props.accessible,true);
    heading.props.ref.current={handle:71};await r.h.act(async()=>r.h.tree.props.onShow());assert.deepEqual(r.focus,[71]);
    assert.ok(node(r.h,'Editor'));assert.equal(r.h.tree.props.animationType,'none');
  }finally{await r.h.unmount();}
});
test('native Back and unsaved Continue dismiss isolation without saving, hiding background roots or installing global Back handlers',async()=>{
  for(const mode of ['back','continue']){const r=gate(),pending=deferred();r.h.services.fetchMyArenaInterests=()=>pending.promise;
    try{await r.h.mount();const shown=r.h.tree.props.onShow;const heading=r.h.nodes.find(n=>n.props.accessibilityRole==='header');heading.props.ref.current={handle:72};
      if(mode==='back')await r.h.act(async()=>r.h.tree.props.onRequestClose());else await r.h.act(async()=>button(r.h,'Continue without saving').props.onPress());
      assert.equal(r.h.tree,null);shown();assert.deepEqual(r.focus,[]);await r.h.act(async()=>pending.resolve({version:1}));
      assert.equal(r.h.tree,null);assert.deepEqual(r.events,[]);assert.deepEqual(r.h.calls,[]);
      r.path('/profile');await r.h.update();assert.equal(r.h.tree,null); // no lingering overlay/isolation on the background route
    }finally{await r.h.unmount();}
  }
});
test('failed preferences remain in the modal with an accessible Retry and Continue; completion keeps the handoff in the dialog',async()=>{
  const r=gate();r.h.services.fetchMyArenaInterests=async()=>{throw Error('offline');};
  try{await r.h.mount();assert.equal(r.h.tree.type,'Modal');assert.ok(button(r.h,'Retry preferences'));assert.ok(button(r.h,'Continue without saving'));
    r.h.services.fetchMyArenaInterests=async()=>({version:0});await r.h.act(async()=>button(r.h,'Retry preferences').props.onPress());
    await r.h.act(async()=>node(r.h,'Editor').props.onSaved({version:1}));assert.equal(r.h.tree.type,'Modal');assert.ok(node(r.h,'Next'));
    await r.h.act(async()=>node(r.h,'Next').props.onDone());assert.equal(r.h.tree,null);assert.deepEqual(r.events,[{type:'saved'}]);
  }finally{await r.h.unmount();}
});
test('old modal show/exit callbacks cannot focus or dismiss a new account dialog',async()=>{
  const r=gate();try{await r.h.mount();const oldShow=r.h.tree.props.onShow,oldClose=r.h.tree.props.onRequestClose;
    r.h.auth={user:{id:'other'},loading:false};await r.h.update();const heading=r.h.nodes.find(n=>n.props.accessibilityRole==='header');heading.props.ref.current={handle:73};
    await r.h.act(async()=>{oldShow();oldClose();});assert.deepEqual(r.focus,[]);assert.equal(r.h.tree.type,'Modal');
    await r.h.act(async()=>r.h.tree.props.onShow());assert.deepEqual(r.focus,[73]);
  }finally{await r.h.unmount();}
});
test('interest choices retain accessible checkbox state and individual touch actions inside the native dialog',async()=>{
  let selected;const h=harness('components/onboarding/TopicSelection.tsx',{catalogue:[{id:'film',name:'Film',description:'Film discussion'}],selected:[],disabled:false,onChange:v=>selected=v},undefined,{dependencies:{'react-native-reanimated':{__esModule:true,default:{View:'View'},FadeIn:{duration:()=>({reduceMotion:()=>undefined})},ReduceMotion:{System:'system'}}}});
  try{await h.mount();const checkbox=h.nodes.find(n=>n.props.accessibilityRole==='checkbox');assert.equal(checkbox.props.accessibilityLabel,'Film');
    assert.equal(checkbox.props.accessibilityState.checked,false);await h.act(async()=>checkbox.props.onPress());assert.deepEqual(selected,['film']);
  }finally{await h.unmount();}
});
test('Vault scene reserves the floating dock footprint at small/large safe areas independently of font scale',async()=>{
  const Tabs=Object.assign(()=>null,{Screen:'Screen'});
  const h=harness('app/(vault)/_layout.tsx',{},undefined,{dependencies:{'expo-router':{Tabs},
    RealmTabBar:leaf('RealmTabBar'),RealmPortal:leaf('RealmPortal'),useRealmSwitch:{useRealmSwitch:()=>({shifting:false,shiftTo(){}})} } });
  try{await h.mount();const tabs=h.nodes.find(n=>n.type===Tabs),p=h.load('components/navigation/dockConfig.ts');
    assert.equal(tabs.props.screenOptions.sceneStyle.paddingBottom,p.dockViewportInset(16));
    for(const width of [320,360,430])for(const scale of [1,1.3,1.5])for(const safe of [0,16,34]){
      h.dimensions.width=width;h.dimensions.fontScale=scale;assert.ok(p.dockViewportInset(safe)>p.DOCK_HEIGHT+Math.max(safe,8));
    }
  }finally{await h.unmount();}
});
test('Vault history includes returned expired Takes, opens canonical detail and rejects stale account navigation',async()=>{
  const h=harness('components/vault/VaultProfileTakes.tsx',{profileId:'profile-a'});let reads=0;
  h.services.fetchProfileTakes=async id=>{assert.equal(id,'profile-a');reads++;return[{id:'old',status:'expired',text:'Historical Take',expiresAt:1}];};
  try{await h.mount();const card=node(h,'TakeMiniCard');assert.ok(card);assert.equal(card.props.take.status,'expired');
    const open=card.props.onPress;await h.act(async()=>open());assert.deepEqual(h.calls,[['push','/take/old']]);assert.equal(reads,1);
    h.auth={user:{id:'other'}};await h.update();await h.act(async()=>open());assert.equal(h.calls.length,1);
  }finally{await h.unmount();}
});
test('history denial/error is not an empty history; guest never issues a profile query; retry uses the existing read',async()=>{
  for(const mode of ['guest','42501','network']){const h=harness('components/vault/VaultProfileTakes.tsx',{profileId:'profile-a'});let reads=0;
    if(mode==='guest')h.auth={user:null,loading:false};h.services.fetchProfileTakes=async()=>{reads++;throw{code:mode};};
    try{await h.mount();if(mode==='guest'){assert.equal(reads,0);assert.equal(h.tree.props.actionLabel,'Sign in');}
      else{const feedback=node(h,'ReadFeedback');assert.equal(feedback.props.status,mode==='42501'?'denied':'error');assert.equal(node(h,'EmptyState'),undefined);
        if(mode==='network'){h.services.fetchProfileTakes=async()=>{reads++;return[];};await h.act(async()=>feedback.props.retry());assert.equal(reads,2);
          const empty=node(h,'EmptyState');assert.equal(empty.props.actionLabel,'Open Arena');await h.act(async()=>empty.props.onAction());assert.deepEqual(h.calls,[['push','/(tabs)']]);}
      }
    }finally{await h.unmount();}
  }
});
test('late history responses cannot restore data after account switch or unmount',async()=>{
  const h=harness('components/vault/VaultProfileTakes.tsx',{profileId:'a'}),pending=deferred();h.services.fetchProfileTakes=()=>pending.promise;
  try{await h.mount();h.auth={user:null,loading:false};await h.update();await h.act(async()=>pending.resolve([{id:'private-old'}]));
    assert.equal(node(h,'TakeMiniCard'),undefined);assert.equal(h.tree.props.actionLabel,'Sign in');
  }finally{await h.unmount();}
});
test('interactive editorial media has an explicit accessible name and retains its single content action',async()=>{
  for(const props of [{accessibilityLabel:'View service details: A real service'},{title:'Real Drop',kicker:'Free'},{}]){
    let calls=0;const h=harness('components/vault/world/EditorialMedia.tsx',{...props,height:100,onPress:()=>calls++},e=>e.EditorialMedia.type);
    try{await h.mount();const press=node(h,'PressableScale');assert.ok(press.props.accessibilityLabel.trim());await h.act(async()=>press.props.onPress());assert.equal(calls,1);
      if(props.accessibilityLabel)assert.equal(press.props.accessibilityLabel,props.accessibilityLabel);
    }finally{await h.unmount();}
  }
});
test('service and product thumbnails receive content-specific accessible names without admitting commerce',async()=>{
  for(const [file,selector,expected] of [['SessionInvite',e=>e.SessionInvite.type,'View service details: Real item'],['GalleryShelf',e=>e.GalleryShelf.type,'View product details: Real item']]){
    const h=harness(`components/vault/world/${file}.tsx`,{items:[{id:'existing',title:'Real item'}],creatorName:'Creator',onOpen(){}},selector,{dependencies:{EditorialMedia:{EditorialMedia:'Media'}}});
    try{await h.mount();assert.equal(node(h,'Media').props.accessibilityLabel,expected);}finally{await h.unmount();}
  }
});
test('Service Detail renders a real separator and retains the deferred request boundary',async()=>{
  const h=harness('components/vault/ServiceDetail.tsx',{serviceId:'existing'},undefined,{dependencies:{ServiceRequest:{ServiceRequest:'Request'},VaultBackButton:leaf('VaultBackButton')}});
  h.services.fetchCreatorService=async()=>({id:'existing',creatorId:'owner',title:'Service',deliveryType:'online',accessType:'free',priceAmountMinor:0,currency:'INR'});
  h.services.fetchProfileById=async()=>null;h.services.vaultCoverUrl=()=>null;
  try{await h.mount();assert.match(text(h.tree),/online\s+·\s+/);assert.doesNotMatch(text(h.tree),/online\s+\?\s+/);assert.equal(node(h,'Request').props.serviceId,'existing');
    assert.ok(!h.nodes.some(n=>n.props.label==='Open link'));
  }finally{await h.unmount();}
});
test('P0006 active-duel refusal renders one eligibility message without a refresh error or a duplicate send',async()=>{
  const loader=harness('services/arenaChallengeService.ts',{},()=>()=>null,{dependencies:{supabaseClient:{SupabaseError:class extends Error{}},apiService:{fetchTakeById(){}},clashEngineService:{fetchClashViewForTake(){}}}}),ErrorClass=loader.load('services/arenaChallengeService.ts').ChallengeEligibilityError;
  const take={id:'take',authorId:'another',text:'A real position',status:'active',expiresAt:Date.now()+7200000};let writes=0;
  const h=harness('components/arena/TakeChallenges.tsx',{take,openComposer:true,compact:true},e=>e.TakeChallenges,{dependencies:{
    'react-native':native,'expo-router':{useRouter:()=>h.router,useFocusEffect:f=>React.useEffect(f,[f])},
    useRequireAuth:{useRequireAuth:()=>()=>true},arenaChallengeService:{ChallengeEligibilityError:ErrorClass,
      fetchEligibleChallengeTake:async()=>take,listArenaChallenges:async()=>[],createArenaChallenge:async()=>{writes++;throw new ErrorClass(take,'active_duel');}},
  }});
  h.services.errorText=e=>e.message;
  try{await h.mount();await h.act(async()=>node(h,'TextInput').props.onChangeText('An eligible counter position with a meaningful argument.'));
    const send=button(h,'SEND CHALLENGE').props.onPress;await h.act(async()=>{send();send();});assert.equal(writes,1);
    assert.equal(node(h,'Modal').props.visible,false);const copy=text(h.tree);
    assert.equal(copy.split('This Take already has an active duel.').length-1,1);assert.doesNotMatch(copy,/Couldn.t refresh/);
    assert.ok(button(h,'Check challenge eligibility'));
    await h.act(async()=>button(h,'Challenge history').props.onPress());assert.equal(text(h.tree).split('This Take already has an active duel.').length-1,1);
    const scroll=node(h,'ScrollView'),style=Object.assign({},...scroll.props.contentContainerStyle);assert.ok(style.paddingBottom>=16+24);
  }finally{await h.unmount();await loader.unmount();}
});
test('Explore For You/search reserve the resting rail band and suppress expansion over cards',async()=>{
  const dependencies=Object.fromEntries(['CountryPickerSheet','ExploreDiscoverShelves','ExploreFilterWheel','ExploreModeRail','ExploreSearch','ExploreWorldCanvas','MeetHomePanel','PlayHomePanel','WorldActiveRail','WorldCountryPanel','WorldSurpriseCard'].map(n=>[n,leaf(n)]));
  Object.assign(dependencies,{ExploreAccountBoundary:{withExploreAccount:Screen=>Screen},ExploreMosaicRow:leaf('ExploreMosaicRowView'),useDebouncedValue:{useDebouncedValue:v=>v},
    'expo-constants':{__esModule:true,default:{expoConfig:{extra:{appVariant:'production'}}}},
    'react-native-reanimated':{__esModule:true,default:{View:'View'},useReducedMotion:()=>true,useSharedValue:v=>React.useRef({value:v}).current,useAnimatedStyle:f=>f(),interpolate:(v,[a,b],[x,y])=>x+(y-x)*(v-a)/(b-a),withTiming:v=>v}});
  const h=harness('app/(tabs)/explore.tsx',{},undefined,{dependencies});
  h.services.fetchExploreForYou=async()=>({items:[],nextCursor:null});h.services.fetchExploreWorldSummary=async()=>({countries:[],challenges:[],treasures:[]});
  h.services.fetchExploreLive=async()=>({topics:[],takes:[]});h.services.clearTeleportHistory=()=>{};h.services.searchExplore=async()=>({});
  try{await h.mount();const p=h.load('utils/exploreWorldLayout.ts');assert.equal(node(h,'ExploreModeRail').props.expandable,false);
    const list=node(h,'FlatList');assert.ok(list.props.contentContainerStyle.paddingRight>=p.EXPLORE_RAIL_RIGHT+p.EXPLORE_RAIL_COLLAPSED_W);
    await h.act(async()=>node(h,'ExploreSearch').props.onChange('query'));assert.equal(node(h,'ExploreModeRail').props.expandable,false);
    assert.ok(node(h,'ScrollView').props.contentContainerStyle.paddingRight>=p.EXPLORE_RAIL_RIGHT+p.EXPLORE_RAIL_COLLAPSED_W);
  }finally{await h.unmount();}
});
test('rail collapse clamps its width immediately on returning to cards, including during an in-flight expansion',async()=>{
  const actions=[];const h=harness('components/explore/ExploreModeRail.tsx',{mode:'world',expandable:true,onChange:m=>actions.push(m)},undefined,{dependencies:{
    'react-native-reanimated':{__esModule:true,default:{View:'View',Text:'Text'},useReducedMotion:()=>false,useSharedValue:v=>React.useRef({value:v}).current,
      useAnimatedStyle:f=>f(),interpolate:(v,[a,b],[x,y])=>x+(y-x)*(v-a)/(b-a),withTiming:v=>v,withSpring:v=>v},
  }});
  try{await h.mount();await h.act(async()=>h.nodes.find(n=>n.props.onLongPress).props.onLongPress());
    await h.update({mode:'for_you',expandable:false,onChange:m=>actions.push(m)});
    assert.equal(h.tree.props.style[1].width,52);const tab=h.nodes.find(n=>n.props.onPress);
    await h.act(async()=>tab.props.onPress());assert.equal(actions.length,1);
  }finally{await h.unmount();}
});
test('onboarding modal applies safe-area top/bottom padding and passes safeArea=false to avoid double insets',async()=>{
  const r=gate();try{await r.h.mount();assert.equal(r.h.tree.props.statusBarTranslucent,true);
    const root=r.h.tree.props.children;assert.equal(root.type,'View');assert.ok(root.props.style.paddingTop>=24+8);
    assert.equal(root.props.style.paddingBottom,16);assert.equal(node(r.h,'Editor').props.safeArea,false);
  }finally{await r.h.unmount();}
});
test('standalone editor/next-step keep safeArea insets while modal-contained status scrolls cleanly',async()=>{
  const r=gate();r.h.services.fetchMyArenaInterests=async()=>{throw Error('offline');};
  try{await r.h.mount();assert.ok(node(r.h,'ScrollView'));
    const next=harness('components/onboarding/OnboardingNextStep.tsx',{onDone(){}},undefined,{dependencies:{'react-native':native}});
    next.services.fetchPersonalizedArenaTakes=async()=>[];try{await next.mount();
      const s1=Object.assign({},...next.tree.props.contentContainerStyle);assert.ok(s1.paddingTop>=24+24);assert.ok(s1.paddingBottom>=16+24);
      await next.update({safeArea:false,onDone(){}});
      const s2=Object.assign({},...next.tree.props.contentContainerStyle);assert.equal(s2.paddingTop,24);assert.equal(s2.paddingBottom,24);
    }finally{await next.unmount();}
  }finally{await r.h.unmount();}
});
