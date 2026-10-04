/**
 * LOCAL ONLY — upload gradient PNG posters for vault_creator_worlds.sql paths.
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

const POSTERS = [
  { path: 'devfx_vw_maya/devfx_vw_maya_free/devfx_vw_maya_free.png', rgb: [36, 18, 22] },
  { path: 'devfx_vw_maya/devfx_vw_maya_teaser/devfx_vw_maya_teaser.png', rgb: [58, 24, 28] },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep1/devfx_vw_maya_ep1.png', rgb: [42, 28, 34] },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep2/devfx_vw_maya_ep2.png', rgb: [28, 22, 40] },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep3/devfx_vw_maya_ep3.png', rgb: [20, 30, 36] },
  { path: 'devfx_vw_maya/devfx_vw_maya_svc/devfx_vw_maya_svc.png', rgb: [70, 36, 28] },
  { path: 'devfx_vw_maya/devfx_vw_maya_course/devfx_vw_maya_course.png', rgb: [48, 22, 30] },
  { path: 'devfx_vw_maya/devfx_vw_maya_prod/devfx_vw_maya_prod.png', rgb: [32, 40, 52] },
  { path: 'devfx_vw_leo/devfx_vw_leo_free/devfx_vw_leo_free.png', rgb: [18, 36, 72] },
  { path: 'devfx_vw_leo/devfx_vw_leo_course/devfx_vw_leo_course.png', rgb: [24, 48, 88] },
  { path: 'devfx_vw_leo/devfx_vw_leo_svc/devfx_vw_leo_svc.png', rgb: [30, 52, 96] },
  { path: 'devfx_vw_aria/devfx_vw_aria_free/devfx_vw_aria_free.png', rgb: [64, 28, 80] },
  { path: 'devfx_vw_aria/devfx_vw_aria_col/devfx_vw_aria_col.png', rgb: [72, 32, 88] },
  { path: 'devfx_vw_aria/devfx_vw_aria_svc/devfx_vw_aria_svc.png', rgb: [56, 24, 70] },
  { path: 'devfx_vw_aria/devfx_vw_aria_prod/devfx_vw_aria_prod.png', rgb: [48, 20, 64] },
  { path: 'devfx_vw_noah/devfx_vw_noah_free/devfx_vw_noah_free.png', rgb: [18, 56, 48] },
  { path: 'devfx_vw_noah/devfx_vw_noah_course/devfx_vw_noah_course.png', rgb: [22, 64, 54] },
  { path: 'devfx_vw_noah/devfx_vw_noah_prod/devfx_vw_noah_prod.png', rgb: [16, 48, 42] },
];

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

function gradientPng(width, height, rgb) {
  const [r0, g0, b0] = rgb;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(1, height - 1);
    const r = Math.round(r0 + (255 - r0) * t * 0.35);
    const g = Math.round(g0 + (255 - g0) * t * 0.28);
    const b = Math.round(b0 + (220 - b0) * t * 0.4);
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      const edge = x / Math.max(1, width - 1);
      raw[i] = Math.min(255, r + Math.round(18 * edge));
      raw[i + 1] = Math.min(255, g + Math.round(10 * (1 - edge)));
      raw[i + 2] = Math.min(255, b + Math.round(14 * edge));
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
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function assertLocalVaultFixtureTarget(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') {
    throw new Error('vault fixtures require a local Supabase API URL');
  }
  if (!/127\.0\.0\.1|localhost/i.test(apiUrl)) {
    throw new Error(`Refusing non-local API_URL: ${apiUrl}`);
  }
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
    const body = gradientPng(640, 360, poster.rgb);
    const { error } = await supabase.storage.from('public-media').upload(poster.path, body, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });
    if (error) fail(`${poster.path}: ${error.message}`);
    uploaded += 1;
  }
  console.log(`upload-vault-fixture-media: uploaded ${uploaded} public posters`);
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? process.argv[1]);
if (isDirect || process.argv[1]?.includes('upload-vault-fixture-media')) {
  main().catch((error) => fail(error?.message ?? String(error)));
}
