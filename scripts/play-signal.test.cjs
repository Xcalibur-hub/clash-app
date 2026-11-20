const test = require('node:test'), assert = require('node:assert/strict');
const { harness, text } = require('./ui-completion-harness.cjs');
const base = 'components/play/signal/';
const dependencies = { ArenaPrimitives: { ArenaButton: 'Button' }, ThemeProvider: { PresentationThemeProvider: 'Theme' }, 'expo-status-bar': { StatusBar: 'StatusBar' } };
const constants = variant => ({ __esModule: true, default: { expoConfig: { extra: { appVariant: variant } } } });
const model = () => harness(base + 'model.ts', {}, () => () => null).load(base + 'model.ts');
const button = (h, label) => h.nodes.find(n => n.props?.label === label || n.props?.accessibilityLabel === label);
const press = (h, label) => h.act(async () => { const b = button(h, label); assert.ok(b, label); assert.ok(!b.props.disabled); b.props.onPress(); });
const experience = () => harness(base + 'SignalGame.tsx', { onExit() {}, onTheme() {} }, e => e.SignalExperience, { dependencies, setTimeout() { throw Error('Game must not schedule timers'); } });

test('five reviewed puzzles have distinct rules, valid masks, unique answers and independently checked solutions', () => {
  const m = model(), expected = [4, 15, 208, 7, 1], frames = [[1,2,8],[1,3,7],[25,22,304],[73,7,78,73],[1,20,256,80]];
  assert.equal(m.SIGNAL_PUZZLES.length, 5); assert.equal(new Set(m.SIGNAL_PUZZLES.map(p => p.rule)).size, 5);
  m.SIGNAL_PUZZLES.forEach((p, i) => {
    assert.deepEqual(p.frames, frames[i]); assert.equal(m.expectedSignal(p), expected[i]);
    assert.equal(p.options.length, 3); assert.equal(new Set(p.options).size, 3);
    assert.equal(p.options.filter(mask => mask === expected[i]).length, 1);
    assert.ok([...p.frames, ...p.options].every(mask => Number.isInteger(mask) && mask >= 0 && mask < 2 ** (p.size * p.size)));
    assert.ok(p.explanation.length > 60);
  });
  assert.equal(m.rotateSignal(1, 2), 2); assert.equal(m.rotateSignal(2, 2), 8); assert.equal(m.rotateSignal(8, 2), 4);
  assert.equal(m.rotateSignal(25, 3), 22); assert.equal(m.rotateSignal(22, 3), 304); assert.equal(m.rotateSignal(304, 3), 208);
  assert.equal(m.signalDescription(0, 3), 'no lights'); assert.equal(m.signalDescription(1, 3), 'row 1 column 1');
});

test('pure state covers perfect, incorrect and mixed runs, accuracy, final result, immutable transitions and replay', () => {
  const m = model();
  for (const answers of [[0,1,2,0,2], [1,0,0,1,0], [0,0,2,1,2]]) {
    let s = m.initialSignal(); assert.equal(s.phase, 'intro'); s = m.signalStep(Object.freeze(s), { type: 'start' });
    answers.forEach((option, round) => {
      s = m.signalStep(Object.freeze(s), { type: 'answer', run: s.run, round, option }); assert.equal(s.phase, 'feedback');
      s = m.signalStep(Object.freeze(s), { type: 'next', run: s.run, round });
    });
    const score = answers.filter((v, i) => v === [0,1,2,0,2][i]).length;
    assert.equal(s.phase, 'finished'); assert.equal(s.score, score); assert.equal(m.signalAccuracy(s), score * 20);
    const oldRun = s.run; s = m.signalStep(s, { type: 'replay' }); assert.equal(s.phase, 'playing'); assert.equal(s.score, 0); assert.equal(s.round, 0); assert.equal(s.run, oldRun + 1);
  }
});

test('duplicate, malformed, stale-round and stale-run input cannot count or advance twice', () => {
  const m = model(); let s = m.signalStep(m.initialSignal(), { type: 'start' });
  for (const option of [-1,3,NaN,Infinity,0.5,'0',null,undefined]) assert.equal(m.signalStep(s, { type: 'answer', run: s.run, round: 0, option }), s);
  for (const action of [{type:'next',run:s.run,round:0},{type:'replay'},{type:'start'},{type:'answer',run:0,round:0,option:0},{type:'answer',run:s.run,round:1,option:0}]) assert.equal(m.signalStep(s, action), s);
  const answer = { type: 'answer', run: s.run, round: 0, option: 0 }; s = m.signalStep(s, answer); assert.equal(m.signalStep(s, answer), s);
  const next = {type:'next',run:s.run,round:0}; s = m.signalStep(s,next); assert.equal(m.signalStep(s,next),s); assert.equal(m.signalStep(s,answer),s);
});

test('actual game/board callbacks complete a run, fence rapid presses and old replay callbacks with no service operations', async () => {
  const h = experience(), child = harness(base + 'SignalBoard.tsx', {}, e => e.SignalBoard); let staleAnswer;
  const props = () => h.nodes.find(n => n.type?.name === 'SignalBoard').props;
  try {
    await h.mount(); assert.match(text(h.tree), /No timer, saved score or rewards/); await press(h, 'Start SIGNAL');
    for (let round = 0; round < 5; round++) {
      await child.update(props()); const correct = [0,1,2,0,2][round], option = round === 1 ? 0 : correct;
      const callback = child.nodes.filter(n => n.props?.accessibilityRole === 'button')[option].props.onPress;
      if (!round) staleAnswer = callback;
      await h.act(async () => { callback(); callback(); }); await child.update(props());
      assert.equal(props().answer, option); assert.ok(child.nodes.filter(n => n.props?.accessibilityRole === 'button').every(n => n.props.disabled));
      assert.match(text(child.tree), option === correct ? /Signal found/ : /A different rule/);
      const next = button(h, round === 4 ? 'See local result' : 'Next signal').props.onPress;
      await h.act(async () => { next(); next(); });
      if (round < 4) assert.equal(props().puzzle.id, ['grow','turn','merge','dual'][round]);
    }
    assert.match(text(h.tree), /Run complete/); assert.match(text(h.tree), /80\s*% accuracy/);
    await press(h,'Play SIGNAL again'); assert.equal(props().puzzle.id,'orbit'); assert.equal(props().answer,null);
    await h.act(async () => staleAnswer()); assert.equal(props().answer,null); assert.match(text(h.tree), /Score\s+0/);
    assert.deepEqual(h.calls,[]); assert.deepEqual(child.calls,[]);
  } finally { await child.unmount(); await h.unmount(); }
});

test('leave/unmount and re-entry start clean, while rerender/background-like pauses retain the current untimed frame', async () => {
  let exits = 0; const h = experience();
  try { await h.mount(); await h.update({onExit:()=>exits++,onTheme(){}}); await press(h,'Start SIGNAL');
    const node = h.nodes.find(n=>n.type?.name==='SignalBoard'); await h.act(async()=>node.props.onAnswer(0));
    await h.update(); assert.equal(h.nodes.find(n=>n.type?.name==='SignalBoard').props.answer,0);
    await press(h,'Back'); assert.equal(exits,1);
  } finally { await h.unmount(); }
  const fresh = experience(); try { await fresh.mount(); assert.ok(button(fresh,'Start SIGNAL')); assert.equal(fresh.nodes.some(n=>n.type?.name==='SignalBoard'),false); } finally { await fresh.unmount(); }
});

test('entry and direct route both require dev JS plus native dev identity; account identity keys reset local runs', async () => {
  for(const dev of [true,false]) for(const variant of ['development','production','preview',undefined]) {
    global.__DEV__=dev; const deps={...dependencies,'expo-constants':constants(variant),SignalGame:{SignalGame:'Game'},ReleaseUnavailable:{ReleaseUnavailable:'Unavailable'}};
    const card=harness(base+'SignalEntry.tsx',{},e=>e.SignalEntry,{dependencies:deps});
    const route=harness('app/explore/play/signal.tsx',{},e=>e.default,{dependencies:deps});
    try { await card.mount(); await route.mount(); const allowed=dev && variant==='development';
      assert.equal(card.tree!==null,allowed); assert.equal(route.tree.type,allowed?'Game':'Unavailable');
      if(allowed){await press(card,'Open SIGNAL local skill game');assert.deepEqual(card.calls,[['push','/explore/play/signal']]);
        const key=route.tree.key;route.auth={...route.auth,user:{id:'other-account'}};await route.update();assert.notEqual(route.tree.key,key);}
      else assert.deepEqual(card.calls,[]);
    }finally{await card.unmount();await route.unmount();}
  }delete global.__DEV__;
});

test('feedback respects both reduced-motion sources and exposes non-colour feedback/accessible light coordinates', async()=>{
  const puzzle=model().SIGNAL_PUZZLES[0]; const h=harness(base+'SignalBoard.tsx',{puzzle,answer:null,onAnswer(){}},e=>e.SignalBoard);
  try{await h.mount();h.motion.reduced=false;await h.update({puzzle,answer:0,onAnswer(){}});assert.ok(h.animations.some(a=>a[1]===160));
    const count=h.animations.length;h.motion.reduced=true;await h.update();assert.equal(h.animations.length,count);
    h.motion.reduced=false;await h.update({puzzle,answer:0,onAnswer(){},reduceMotion:true});assert.equal(h.animations.length,count);
    assert.match(text(h.tree),/Correct/);assert.match(text(h.tree),/Signal found/);assert.ok(h.nodes.some(n=>n.props?.accessibilityLabel?.startsWith('Frame 1: row 1 column 1')));
  }finally{await h.unmount();}
});

test('game and board keep scalable wrapping/minimum targets across controlled widths/themes; screen owns safe area once',async()=>{
  const h=experience(), board=harness(base+'SignalBoard.tsx',{puzzle:model().SIGNAL_PUZZLES[4],answer:null,onAnswer(){}},e=>e.SignalBoard);
  try{await h.mount();await board.mount();assert.equal(h.tree.props.style[1].paddingTop,24);assert.equal(h.tree.props.style[1].paddingBottom,16);
    assert.equal(h.nodes.find(n=>n.type==='ScrollView').props.contentContainerStyle.paddingBottom,32);
    for(const width of [320,360,430])for(const fontScale of [1,1.3])for(const scheme of ['light','dark']){
      Object.assign(h.dimensions,{width,fontScale});Object.assign(board.dimensions,{width,fontScale});h.colors.scheme=scheme;board.colors.scheme=scheme;await h.update();await board.update();
      assert.ok([...h.nodes,...board.nodes].filter(n=>n.type==='Text').every(n=>n.props.allowFontScaling!==false && n.props.numberOfLines===undefined));
      assert.ok(board.nodes.filter(n=>n.props?.accessibilityRole==='button').every(n=>n.props.style[0].minHeight>=48));
    }
  }finally{await h.unmount();await board.unmount();}
});
