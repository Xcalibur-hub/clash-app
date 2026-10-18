/* Optional local Chromium capture. Uses only an attempt-owned browser profile.
 * No installed browser profile, mobile state, application data or network backend. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'), output = path.resolve(process.argv[2] || '');
const demo = process.argv.includes('--demo');
assert.ok(output.startsWith(path.join(root, '.expo') + path.sep), 'Use the generated ignored preview directory');
const chrome = process.env.ARENA_PREVIEW_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(fs.existsSync(chrome), 'An existing Chromium browser is required; no download/install');
const profile = path.join(output, 'capture-profile');
assert.ok(!fs.existsSync(profile), 'Fresh isolated browser profile required');
const files = fs.readdirSync(output).filter(f => f.endsWith('.html')).sort();
assert.equal(files.length, demo ? 12 : 10, 'Generate the complete preview set first');
const log = fs.openSync(path.join(output, 'capture-browser.log'), 'w');
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-component-update', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', log, log], windowsHide: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
async function connect(url) {
  assert.ok(/^ws:\/\/127\.0\.0\.1:\d+\//.test(url), 'Only local browser debugging permitted');
  const socket = new WebSocket(url); const pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const data = JSON.parse(event.data); const job = pending.get(data.id); if (job) { pending.delete(data.id); clearTimeout(job.timer); data.error ? job.reject(Error(data.error.message)) : job.resolve(data.result); } };
  return { close: () => socket.close(), send: (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject, timer: setTimeout(() => { pending.delete(n); reject(Error('Bounded browser command timeout: ' + method)); }, 15000) }); socket.send(JSON.stringify({ id: n, method, params })); }) };
}
(async () => {
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 40 && !fs.existsSync(portFile); i++) await pause(250);
    assert.ok(fs.existsSync(portFile), 'Isolated browser did not start');
    const [port] = fs.readFileSync(portFile, 'utf8').split(/\r?\n/); assert.match(port, /^\d+$/);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(p => p.type === 'page'); assert.ok(page, 'Local page target required');
    const cdp = await connect(page.webSocketDebuggerUrl); const results = [];
    await cdp.send('Page.enable');
    for (const filename of files) {
      const width = demo ? 360 : Number(filename.match(/-(320|360)\b/)[1]);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: demo ? width : width * 2 + 52, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: pathToFileURL(path.join(output, filename)).href });
      await pause(200);
      const evaluated = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{await document.fonts.ready;const after=[...document.querySelectorAll('section')][${demo ? 0 : 1}];const scroll=after.querySelector('[data-testid="preview-scroll"]')||after;const buttons=[...after.querySelectorAll('[role="button"],[role="tab"]')].map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||e.textContent,width:r.width,height:r.height}}).filter(b=>b.width&&b.height);return{preview_label:document.querySelector('h1').textContent,after_horizontal_overflow:scroll.scrollWidth>scroll.clientWidth+1,buttons,undersized_targets:buttons.filter(b=>b.width<43.9||b.height<43.9),font_faces_loaded:document.fonts.check('13px Inter_500Medium')}})()` });
      assert.ok(evaluated.result.value, 'Actual browser layout evidence required');
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, filename.replace('.html', '.png')), Buffer.from(capture.data, 'base64'));
      results.push({ filename, ...evaluated.result.value });
    }
    fs.writeFileSync(path.join(output, 'browser-layout.json'), JSON.stringify(results, null, 2));
    cdp.close(); console.log(JSON.stringify({ captured: results.length, overflow_cases: results.filter(r => r.after_horizontal_overflow).length, undersized_targets: results.reduce((n, r) => n + r.undersized_targets.length, 0) }));
  } finally {
    if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    fs.closeSync(log);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
