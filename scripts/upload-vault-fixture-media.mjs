/**
 * LOCAL ONLY — upload cinematic synthetic PNG posters for vault_creator_worlds.sql.
 * Multi-layer compositions (vignette, grain, shapes) — not flat color blocks.
 * Refuses non-local API URLs / missing local Docker container.
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const CONTAINER = 'supabase_db_clash';
const API_PORT = 55321;
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** Distinct recipes so Maya/Leo/Aria/Noah never share the same look. */
const POSTERS = [
  // Maya — dark cinematic horror / analog film
  { path: 'devfx_vw_maya/devfx_vw_maya_free/devfx_vw_maya_free.png', mood: 'horror', seed: 11 },
  { path: 'devfx_vw_maya/devfx_vw_maya_teaser/devfx_vw_maya_teaser.png', mood: 'horror', seed: 12 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep1/devfx_vw_maya_ep1.png', mood: 'horror', seed: 13 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep2/devfx_vw_maya_ep2.png', mood: 'horror', seed: 14 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep3/devfx_vw_maya_ep3.png', mood: 'horror', seed: 15 },
  { path: 'devfx_vw_maya/devfx_vw_maya_svc/devfx_vw_maya_svc.png', mood: 'horrorWarm', seed: 16 },
  { path: 'devfx_vw_maya/devfx_vw_maya_course/devfx_vw_maya_course.png', mood: 'horror', seed: 17 },
  { path: 'devfx_vw_maya/devfx_vw_maya_prod/devfx_vw_maya_prod.png', mood: 'artifactDark', seed: 18 },
  // Leo — street / night photography
  { path: 'devfx_vw_leo/devfx_vw_leo_free/devfx_vw_leo_free.png', mood: 'street', seed: 21 },
  { path: 'devfx_vw_leo/devfx_vw_leo_course/devfx_vw_leo_course.png', mood: 'street', seed: 22 },
  { path: 'devfx_vw_leo/devfx_vw_leo_svc/devfx_vw_leo_svc.png', mood: 'streetCool', seed: 23 },
  // Aria — music studio / abstract audio
  { path: 'devfx_vw_aria/devfx_vw_aria_free/devfx_vw_aria_free.png', mood: 'studio', seed: 31 },
  { path: 'devfx_vw_aria/devfx_vw_aria_col/devfx_vw_aria_col.png', mood: 'studio', seed: 32 },
  { path: 'devfx_vw_aria/devfx_vw_aria_svc/devfx_vw_aria_svc.png', mood: 'studioWarm', seed: 33 },
  { path: 'devfx_vw_aria/devfx_vw_aria_prod/devfx_vw_aria_prod.png', mood: 'artifactWarm', seed: 34 },
  // Noah — architecture / interface / design
  { path: 'devfx_vw_noah/devfx_vw_noah_free/devfx_vw_noah_free.png', mood: 'arch', seed: 41 },
  { path: 'devfx_vw_noah/devfx_vw_noah_course/devfx_vw_noah_course.png', mood: 'arch', seed: 42 },
  { path: 'devfx_vw_noah/devfx_vw_noah_prod/devfx_vw_noah_prod.png', mood: 'artifactClean', seed: 43 },
];

const PALETTES = {
  horror: { a: [18, 10, 14], b: [72, 28, 32], c: [140, 60, 48], light: [210, 170, 140] },
  horrorWarm: { a: [28, 14, 12], b: [90, 40, 28], c: [160, 80, 50], light: [220, 180, 130] },
  street: { a: [8, 16, 36], b: [20, 48, 96], c: [40, 90, 160], light: [220, 200, 120] },
  streetCool: { a: [10, 22, 44], b: [28, 60, 110], c: [70, 130, 190], light: [180, 210, 240] },
  studio: { a: [40, 18, 48], b: [90, 40, 70], c: [180, 90, 60], light: [240, 190, 120] },
  studioWarm: { a: [48, 22, 28], b: [110, 55, 40], c: [190, 110, 70], light: [250, 210, 150] },
  arch: { a: [22, 28, 30], b: [50, 70, 72], c: [120, 140, 138], light: [230, 235, 232] },
  artifactDark: { a: [14, 16, 22], b: [36, 42, 58], c: [80, 90, 120], light: [200, 205, 220] },
  artifactWarm: { a: [30, 18, 24], b: [70, 40, 50], c: [140, 90, 70], light: [235, 200, 160] },
  artifactClean: { a: [28, 32, 36], b: [70, 80, 86], c: [140, 150, 156], light: [240, 242, 244] },
};

function fail(message) {
  console.error(`upload-vault-fixture-media: ${message}`);
  process.exit(1);
}

function assertLocalContainer() {
  const listed = spawnSync(
    'docker',
    ['ps', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  const names = (listed.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!names.includes(CONTAINER)) {
    fail(
      `Local container "${CONTAINER}" is not running.\n` +
        'Run: npm run supabase:start\n' +
        'This upload never targets hosted/production.',
    );
  }
}

function readStatusEnv() {
  const result = spawnSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
    cwd: ROOT,
  });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    api: text.match(/API_URL="([^"]+)"/)?.[1],
    service: text.match(/SERVICE_ROLE_KEY="([^"]+)"/)?.[1],
  };
}

export function assertLocalVaultFixtureTarget(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') {
    throw new Error('vault fixtures require a local Supabase API URL');
  }
  if (!/127\.0\.0\.1|localhost/i.test(apiUrl)) {
    throw new Error(`Refusing non-local API_URL: ${apiUrl}`);
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function hash(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Cinematic still-like PNG: vignette, grain, soft light pools, optional shapes. */
function composePoster(width, height, mood, seed) {
  const p = PALETTES[mood] ?? PALETTES.horror;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const cx = width * (0.35 + hash(seed) * 0.3);
  const cy = height * (0.3 + hash(seed + 3) * 0.4);
  const streakAngle = hash(seed + 7) * Math.PI;

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    const vy = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const vx = x / (width - 1);
      const dx = (x - cx) / width;
      const dy = (y - cy) / height;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Base vertical + radial blend
      let t = mix(vy, dist, 0.55);
      t = Math.max(0, Math.min(1, t));
      let r = mix(mix(p.a[0], p.b[0], t), p.c[0], t * t);
      let g = mix(mix(p.a[1], p.b[1], t), p.c[1], t * t);
      let b = mix(mix(p.a[2], p.b[2], t), p.c[2], t * t);

      // Soft key light
      const light = Math.exp(-dist * dist * (5.5 + hash(seed + 9) * 4));
      r = mix(r, p.light[0], light * 0.55);
      g = mix(g, p.light[1], light * 0.45);
      b = mix(b, p.light[2], light * 0.35);

      // Light streak (street/neon feel) or warm rim
      const proj = (vx - 0.5) * Math.cos(streakAngle) + (vy - 0.5) * Math.sin(streakAngle);
      const streak = Math.exp(-Math.abs(proj) * 18) * (0.15 + hash(seed + x + y) * 0.1);
      r = mix(r, p.light[0], streak);
      g = mix(g, p.light[1], streak * 0.8);
      b = mix(b, p.light[2], streak * 0.6);

      // Soft geometric planes (architecture / design moods)
      if (mood.startsWith('arch') || mood.startsWith('artifact')) {
        const grid = Math.abs(Math.sin(vx * Math.PI * 4 + seed) * Math.cos(vy * Math.PI * 3));
        if (grid > 0.92) {
          r = mix(r, p.light[0], 0.25);
          g = mix(g, p.light[1], 0.25);
          b = mix(b, p.light[2], 0.25);
        }
      }

      // Circular motif for studio
      if (mood.startsWith('studio')) {
        const ring = Math.abs(dist - 0.28);
        if (ring < 0.03) {
          r = mix(r, p.light[0], 0.4);
          g = mix(g, p.light[1], 0.35);
          b = mix(b, p.light[2], 0.3);
        }
      }

      // Vignette
      const vig = Math.min(1, dist * 1.35);
      r *= 1 - vig * 0.55;
      g *= 1 - vig * 0.55;
      b *= 1 - vig * 0.6;

      // Film grain
      const grain = (hash(seed * 10007 + x * 131 + y * 917) - 0.5) * 18;
      r += grain;
      g += grain * 0.9;
      b += grain * 0.85;

      const i = row + 1 + x * 3;
      raw[i] = clamp(r);
      raw[i + 1] = clamp(g);
      raw[i + 2] = clamp(b);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  assertLocalContainer();
  const status = readStatusEnv();
  const apiUrl = status.api ?? `http://127.0.0.1:${API_PORT}`;
  assertLocalVaultFixtureTarget(apiUrl);
  const supabase = createClient(apiUrl, status.service ?? LOCAL_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let uploaded = 0;
  for (const poster of POSTERS) {
    const body = composePoster(720, 960, poster.mood, poster.seed);
    const { error } = await supabase.storage.from('public-media').upload(poster.path, body, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });
    if (error) fail(`${poster.path}: ${error.message}`);
    uploaded += 1;
  }
  console.log(`upload-vault-fixture-media: uploaded ${uploaded} cinematic posters`);
}

if (process.argv[1]?.includes('upload-vault-fixture-media')) {
  main().catch((error) => fail(error?.message ?? String(error)));
}
