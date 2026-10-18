/* Actual React Native components, bridged offline; never a native/runtime claim. */
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const React = require('react'), RN = require('react-native-web'), { renderToStaticMarkup } = require('react-dom/server');
const bridge = require('./arena-demo-render.cjs');
const root = path.resolve(__dirname, '..'), baseline = '31abc4ab7003c1acc6244f6c90ba1ed0fe2a6fce';
let before = false, renderingDiscovery = false;
const originalLoad = Module._load, originalExtensions = new Map(['.ts', '.tsx'].map(ext => [ext, Module._extensions[ext]]));
const babel = require('@babel/core'), sources = new Map();
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (m, file) => {
  if (!before || !file.startsWith(root + path.sep) || file.includes('node_modules')) return originalExtensions.get(ext)(m, file);
  if (!sources.has(file)) sources.set(file, execFileSync('git', ['show', baseline + ':' + path.relative(root, file).replaceAll('\\', '/')], { encoding: 'utf8', cwd: root }));
  m._compile(babel.transformSync(sources.get(file), { filename: file, babelrc: false, configFile: false, presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, file);
};
const gesture = new Proxy({}, { get: () => () => gesture });
Module._load = function(request, parent) {
  const discovery = parent?.filename.endsWith(path.join('arena', 'ArenaClashes.tsx'));
  if (discovery && request.endsWith('/AuthProvider')) return {useAuth: () => ({user:{id:'preview-reader'},signedIn:true})};
  if (discovery && request.includes('/services/')) return { fetchClashDiscovery: async () => { throw Error('Preview network forbidden'); }, fetchClashView: async () => { throw Error('Preview network forbidden'); } };
  if (request === 'react-native-gesture-handler') return { Gesture: { Pan: () => gesture }, GestureDetector: ({children}) => children };
  const result = originalLoad.apply(this, arguments);
  if (discovery && request === 'react') return { ...result, useState(initial) {
    if (renderingDiscovery && initial && typeof initial === 'object' && 'ownerId' in initial) initial = { ownerId: 'preview-reader', entries: [0,1,2,3].map(i => ({ id: 'preview-clash-'+i, takeId:'preview-take-'+i, roomId:'preview-room-'+i, title:['The best technology gives us our attention back.', 'A great city should be designed for the walk home.', 'Four-day weeks should be measured in outcomes.', 'Public libraries are the most underrated social network.'][i], status:'open', state:'LIVE', kind:'CLASH' })) };
    else if (renderingDiscovery && initial === true) initial = false;
    else if (renderingDiscovery && initial === null) initial = {owner:'preview-reader', view:{status:'open', mode:'STANDARD', revealed:true, sideA:{name:'Alex Morgan',tint:'#6489AC'},sideB:{name:'Priya Shah',tint:'#AA7575'}}};
    return result.useState(initial);
  } };
  if (request === 'react-native') return { ...result, Modal: ({visible, children}) => visible ? React.createElement(RN.View, {style: {flex: 1}}, children) : null };
  if (request === 'react-native-reanimated') return { ...result, Extrapolation: { CLAMP: 'clamp' }, interpolate: (_, input, output) => output[0], runOnJS: fn => fn };
  return result;
};
function renderLivePreview(scene, scheme, width = 360, prior = false) {
  before = prior;
  const demo = bridge.renderDemo(scene === 'challenge' ? 'live' : scene, scheme, width);
  if (scene === 'live') {
    const { ArenaClashes } = require('../components/arena/ArenaClashes.tsx');
    renderingDiscovery = true;
    let html;
    try { html = renderToStaticMarkup(React.createElement(RN.View, {style:{width,height:800,overflow:'hidden'}}, React.createElement(ArenaClashes, {topics:[],onEnter(){},onWatch(){}}))); }
    finally { renderingDiscovery = false; }
    const {getStyleElement} = RN.AppRegistry.getApplication('ArenaDesignPreview');
    return {html, css:renderToStaticMarkup(getStyleElement())};
  }
  if (scene !== 'challenge') return demo;
  const { FullScreenChallengeDeck } = require('../components/arena/FullScreenChallengeDeck.tsx');
  const challenge = { id: 'demo-invitation', status: 'PENDING', takeId: 'demo-take-0', challengerId: 'demo-b', challengedId: 'demo-a', counterPosition: 'Connection and creativity also happen on screen. Better tools should give people agency, rather than decide what a meaningful life looks like.', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), resolvedAt: null, clashId: null, roomId: null, created: false, challenger: {id: 'demo-b', name: 'Priya Shah', handle: 'priya_shah'} };
  const html = renderToStaticMarkup(React.createElement(RN.View, {style: {width, height: 800, overflow: 'hidden'}}, React.createElement(FullScreenChallengeDeck, {visible: true, challenges: [challenge], takeText: 'The best technology gives us our attention back.', onClose() {}, async onAccept() {}, async onPass() {}})));
  const {getStyleElement} = RN.AppRegistry.getApplication('ArenaDesignPreview');
  return { html, css: renderToStaticMarkup(getStyleElement()) };
}
module.exports = {renderLivePreview, baseline};
if (require.main === module) {
  const output = path.resolve(process.argv[2] || ''); assert.ok(output.startsWith(path.join(root, '.expo') + path.sep)); fs.mkdirSync(output, {recursive: true});
  for (const width of [360, 320, 430]) for (const scheme of ['dark', 'light']) for (const scene of ['live', 'challenge', 'room']) for (const prior of width === 360 ? [true, false] : [false]) {
    const {html,css} = renderLivePreview(scene, scheme, width, prior);
    const fonts = ['400Regular', '500Medium', '600SemiBold', '700Bold'].map(face => `@font-face{font-family:Inter_${face};src:url('${require('node:url').pathToFileURL(path.join(root,'node_modules/@expo-google-fonts/inter',face,`Inter_${face}.ttf`)).href}')} `).join('');
    fs.writeFileSync(path.join(output, `${scheme}-${scene}-${prior ? 'before' : 'after'}-${width}.html`), `<!doctype html><meta charset="utf-8">${css}<style>${fonts}*{scrollbar-width:none}body{margin:0;background:${scheme==='dark'?'#09090b':'#f2f0eb'};font-family:Arial;color:${scheme==='dark'?'white':'black'}}h1{font-size:11px;margin:0;padding:8px}</style><h1>DEMO PREVIEW · ${prior?'BEFORE':'AFTER'} · ${scene} · ${scheme} · ${width}dp · not native</h1><section style="width:${width}px">${html}</section>`);
  }
  console.log('PASS 24 actual-component HTML previews at 320/360/430dp; 360dp includes before/after; no backend or native claim');
}
