// Preload only in the diagnostic Metro process. Never records query strings,
// headers, response bodies, credentials, or backend traffic.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const output = process.env.CLASH_ANDROID_BUNDLE_TRACE;
if (output) {
  if (!path.isAbsolute(output)) throw Error('Bundle trace requires an absolute private output path');
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event === 'request') {
      const [req, res] = args;
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.endsWith('.bundle')) {
        const started = Date.now();
        const android = /okhttp|Dalvik/.test(req.headers['user-agent'] || '');
        const record = data => fs.appendFileSync(output, JSON.stringify({
          ...data, android, started, at: Date.now(),
        }) + '\n');
        record({ event: 'bundle_requested' });
        res.once('finish', () => record({ event: 'bundle_served', status: res.statusCode }));
      }
    }
    return emit.call(this, event, ...args);
  };
}
