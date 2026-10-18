/* Render the shipped demo components offline, using the existing native/web bridge. */
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict');
const React = require('react'), RN = require('react-native-web'), { renderToStaticMarkup } = require('react-dom/server');
const bridge = require('./arena-design-preview.cjs');
const root = path.resolve(__dirname, '..');
let blockedCalls = 0, renderingDemo = false;
const loader = Module._load;
Module._load = function (request, parent) {
  if (request === 'expo-status-bar') return { StatusBar: () => null };
  if (request.endsWith('/theme/ThemeProvider')) return { PresentationThemeProvider: ({ children }) => children };
  if (renderingDemo && /(?:^|\/)(?:services|store)(?:\/|$)/.test(request)) {
    blockedCalls++; throw Error('A demo imported a production service at runtime: ' + request);
  }
  return loader.apply(this, arguments);
};
function renderDemo(kind, scheme = 'dark', width = 360, id) {
  renderingDemo = false;
  bridge.render({ before: false, scheme, archived: false, width });
  renderingDemo = true;
  const { DemoArena } = require('../components/dev/arenaDemo/DemoArena.tsx');
  const app = React.createElement(DemoArena, { onExit() {}, initialTheme: scheme, initialPage: { kind, id: id ?? (kind === 'take' || kind === 'room' ? 'demo-take-0' : kind === 'group' ? 'demo-group-0' : undefined) } });
  const html = renderToStaticMarkup(React.createElement(RN.View, { style: { width, height: 800, overflow: 'hidden' } }, app));
  assert.ok(html.includes('Fictional people, counts and results'));
  assert.ok(html.includes('Exit demo'));
  assert.equal(blockedCalls, 0);
  const { getStyleElement } = RN.AppRegistry.getApplication('ArenaDesignPreview');
  return { html, css: renderToStaticMarkup(getStyleElement()), blockedCalls };
}
module.exports = { renderDemo };
if (require.main === module) {
  const output = path.resolve(process.argv[2] || '');
  assert.ok(output.startsWith(path.join(root, '.expo') + path.sep), 'Use an ignored .expo output directory');
  fs.mkdirSync(output, { recursive: true });
  let count = 0;
  for (const scheme of ['dark', 'light']) for (const kind of ['home', 'take', 'groups', 'discover', 'live', 'room']) {
    const { html, css } = renderDemo(kind, scheme);
    const fonts = ['400Regular', '500Medium', '600SemiBold', '700Bold'].map(face => `@font-face{font-family:Inter_${face};src:url('${require('node:url').pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', face, `Inter_${face}.ttf`)).href}')} `).join('');
    const bg = scheme === 'dark' ? '#09090B' : '#F2F0EB', ink = scheme === 'dark' ? '#F5F5F5' : '#111113';
    fs.writeFileSync(path.join(output, `${scheme}-${kind}.html`), `<!doctype html><meta charset="utf-8"><title>Demo Arena — browser preview</title>${css}<style>${fonts}*{scrollbar-width:none}::-webkit-scrollbar{display:none}body{margin:0;background:${bg};color:${ink};font-family:Arial}h1{font-size:11px;margin:0;padding:8px}section{width:360px}</style><h1>DEMO ARENA · ${kind} · ${scheme} · browser, not native</h1><section>${html}</section>`);
    count++;
  }
  console.log(JSON.stringify({ actual_demo_pages: count, runtime_service_imports: blockedCalls, native: false, backend: false }));
}
