/**
 * LOCAL ONLY — upload cinematic synthetic PNG posters for vault_creator_worlds.sql.
 * Scene-aware compositions (doorways, streets, studio rings, architecture,
 * contact sheets, artifacts) — not flat gradient blocks. Refuses non-local API
 * URLs / missing local Docker.
 *
 * VIDEO: no encoder (ffmpeg) is guaranteed on a local machine, and a static
 * image labelled as video would be a lie — so this script ships real images
 * only. Where the media model supports video, fixtures use explicit poster
 * stills instead of fake video bytes.
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

/**
 * Distinct scene recipes — Maya/Leo/Aria/Noah never share the same look.
 * `scene` drives composition structure; palette + seed vary lighting.
 */
const POSTERS = [
  // Maya — horror film stills
  { path: 'devfx_vw_maya/devfx_vw_maya_free/devfx_vw_maya_free.png', mood: 'horror', scene: 'doorway', seed: 111 },
  { path: 'devfx_vw_maya/devfx_vw_maya_teaser/devfx_vw_maya_teaser.png', mood: 'horror', scene: 'fogHall', seed: 122 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep1/devfx_vw_maya_ep1.png', mood: 'horror', scene: 'tapeStill', seed: 133 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep2/devfx_vw_maya_ep2.png', mood: 'horror', scene: 'window', seed: 144 },
  { path: 'devfx_vw_maya/devfx_vw_maya_ep3/devfx_vw_maya_ep3.png', mood: 'horrorWarm', scene: 'candleRoom', seed: 155 },
  { path: 'devfx_vw_maya/devfx_vw_maya_svc/devfx_vw_maya_svc.png', mood: 'horrorWarm', scene: 'portraitWarm', seed: 166 },
  { path: 'devfx_vw_maya/devfx_vw_maya_course/devfx_vw_maya_course.png', mood: 'horror', scene: 'filmStrip', seed: 177 },
  { path: 'devfx_vw_maya/devfx_vw_maya_prod/devfx_vw_maya_prod.png', mood: 'artifactDark', scene: 'lutPack', seed: 188 },
  // Leo — night / street photography
  { path: 'devfx_vw_leo/devfx_vw_leo_free/devfx_vw_leo_free.png', mood: 'street', scene: 'neonRain', seed: 211 },
  { path: 'devfx_vw_leo/devfx_vw_leo_course/devfx_vw_leo_course.png', mood: 'street', scene: 'alley', seed: 222 },
  { path: 'devfx_vw_leo/devfx_vw_leo_svc/devfx_vw_leo_svc.png', mood: 'streetCool', scene: 'streetPortrait', seed: 233 },
  // Aria — studio / music
  { path: 'devfx_vw_aria/devfx_vw_aria_free/devfx_vw_aria_free.png', mood: 'studio', scene: 'vinyl', seed: 311 },
  { path: 'devfx_vw_aria/devfx_vw_aria_col/devfx_vw_aria_col.png', mood: 'studio', scene: 'waveform', seed: 322 },
  { path: 'devfx_vw_aria/devfx_vw_aria_svc/devfx_vw_aria_svc.png', mood: 'studioWarm', scene: 'micBooth', seed: 333 },
  { path: 'devfx_vw_aria/devfx_vw_aria_prod/devfx_vw_aria_prod.png', mood: 'artifactWarm', scene: 'samplePack', seed: 344 },
  // Noah — architecture / design
  { path: 'devfx_vw_noah/devfx_vw_noah_free/devfx_vw_noah_free.png', mood: 'arch', scene: 'facade', seed: 411 },
  { path: 'devfx_vw_noah/devfx_vw_noah_course/devfx_vw_noah_course.png', mood: 'arch', scene: 'blueprint', seed: 422 },
  { path: 'devfx_vw_noah/devfx_vw_noah_prod/devfx_vw_noah_prod.png', mood: 'artifactClean', scene: 'uiKit', seed: 433 },  { path: 'devfx_vw_noah/devfx_vw_noah_interior/devfx_vw_noah_interior.png', mood: 'arch', scene: 'interior', seed: 444 },
  { path: 'devfx_vw_noah/devfx_vw_noah_material/devfx_vw_noah_material.png', mood: 'artifactClean', scene: 'material', seed: 455 },
  // Phase 15.3 - richer demo media + Creator World Drop artifacts.
  // The subscriber still lands in private-media; every other asset stays public.
  { path: 'devfx_vw_maya/devfx_vw_maya_sub/devfx_vw_maya_sub.png', mood: 'horror', scene: 'window', seed: 199, bucket: 'private-media' },
  { path: 'devfx_vw_maya/devfx_vw_maya_comm/devfx_vw_maya_comm.png', mood: 'horror', scene: 'communityHero', seed: 201 },
  { path: 'devfx_vw_maya/devfx_vw_maya_bts/devfx_vw_maya_bts.png', mood: 'horrorWarm', scene: 'btsDirecting', seed: 212 },
  { path: 'devfx_vw_maya/devfx_vw_maya_still1/devfx_vw_maya_still1.png', mood: 'horror', scene: 'doorway', seed: 223 },
  { path: 'devfx_vw_maya/devfx_vw_maya_still2/devfx_vw_maya_still2.png', mood: 'horror', scene: 'fogHall', seed: 234 },
  { path: 'devfx_vw_maya/devfx_vw_maya_artifact/devfx_vw_maya_artifact.png', mood: 'horrorWarm', scene: 'artifactFrame', seed: 245 },
  { path: 'devfx_vw_leo/devfx_vw_leo_sheet/devfx_vw_leo_sheet.png', mood: 'street', scene: 'contactSheet', seed: 241 },
  { path: 'devfx_vw_leo/devfx_vw_leo_portrait/devfx_vw_leo_portrait.png', mood: 'streetCool', scene: 'streetPortrait', seed: 252 },
  { path: 'devfx_vw_leo/devfx_vw_leo_detail/devfx_vw_leo_detail.png', mood: 'street', scene: 'neonRain', seed: 263 },
  { path: 'devfx_vw_leo/devfx_vw_leo_hunt/devfx_vw_leo_hunt.png', mood: 'streetCool', scene: 'photoHunt', seed: 274 },
  { path: 'devfx_vw_aria/devfx_vw_aria_album/devfx_vw_aria_album.png', mood: 'studio', scene: 'albumArt', seed: 351 },
  { path: 'devfx_vw_aria/devfx_vw_aria_track/devfx_vw_aria_track.png', mood: 'artifactWarm', scene: 'hiddenTrack', seed: 362 },
  { path: 'devfx_vw_noah/devfx_vw_noah_blueprint/devfx_vw_noah_blueprint.png', mood: 'arch', scene: 'blueprintArtifact', seed: 466 },
];

const PALETTES = {
  horror: { a: [12, 8, 10], b: [48, 18, 22], c: [110, 42, 36], light: [200, 150, 120] },
  horrorWarm: { a: [22, 12, 10], b: [78, 34, 24], c: [150, 72, 42], light: [230, 175, 120] },
  street: { a: [6, 12, 28], b: [16, 40, 86], c: [36, 80, 150], light: [230, 195, 100] },
  streetCool: { a: [8, 18, 38], b: [22, 52, 100], c: [60, 120, 180], light: [170, 205, 235] },
  studio: { a: [32, 14, 40], b: [80, 34, 62], c: [170, 80, 50], light: [245, 185, 110] },
  studioWarm: { a: [42, 18, 22], b: [100, 48, 36], c: [185, 100, 60], light: [255, 205, 140] },
  arch: { a: [18, 24, 26], b: [44, 62, 64], c: [110, 128, 126], light: [228, 232, 228] },
  artifactDark: { a: [10, 12, 18], b: [30, 36, 50], c: [70, 80, 110], light: [190, 198, 215] },
  artifactWarm: { a: [26, 14, 20], b: [64, 36, 44], c: [130, 82, 62], light: [235, 195, 155] },
  artifactClean: { a: [24, 28, 32], b: [64, 74, 80], c: [130, 140, 146], light: [238, 240, 242] },
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

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Scene mask 0..1 — higher = more “subject” / lit structure. */
function sceneMask(scene, vx, vy, seed) {
  const s = seed * 0.01;
  switch (scene) {
    case 'doorway': {
      const door = smoothstep(0.28, 0.32, vx) * (1 - smoothstep(0.68, 0.72, vx));
      const frame = Math.abs(vx - 0.5) < 0.03 || Math.abs(vx - 0.32) < 0.012 || Math.abs(vx - 0.68) < 0.012 ? 0.85 : 0;
      const glow = Math.exp(-((vx - 0.5) ** 2) * 18 - ((vy - 0.55) ** 2) * 10);
      return Math.max(door * (0.35 + vy * 0.5), frame, glow * 0.9);
    }
    case 'fogHall': {
      const walls = Math.exp(-((Math.abs(vx - 0.5) - 0.22) ** 2) * 80);
      const depth = Math.exp(-((vy - 0.35) ** 2) * 6) * Math.exp(-((vx - 0.5) ** 2) * 10);
      const mist = 0.25 + 0.35 * Math.sin(vx * 14 + s) * Math.sin(vy * 9 + s * 2);
      return Math.max(walls * 0.7, depth, mist * 0.5);
    }
    case 'tapeStill': {
      const scan = Math.abs(Math.sin(vy * Math.PI * 90 + s * 40));
      const frame = vy > 0.08 && vy < 0.92 && vx > 0.1 && vx < 0.9 ? 0.55 : 0.15;
      const glitch = hash(Math.floor(vy * 40) * 97 + seed) > 0.92 ? 0.9 : 0;
      return frame * (0.55 + scan * 0.2) + glitch * 0.4;
    }
    case 'window': {
      const panes =
        (1 - smoothstep(0.18, 0.22, Math.abs(vx - 0.5))) *
        (1 - smoothstep(0.12, 0.16, Math.abs(vy - 0.42)));
      const mullion = Math.abs(vx - 0.5) < 0.018 || Math.abs(vy - 0.42) < 0.014 ? 0.95 : 0;
      const spill = Math.exp(-((vx - 0.5) ** 2) * 8 - ((vy - 0.7) ** 2) * 4) * 0.7;
      return Math.max(panes * 0.85, mullion, spill);
    }
    case 'candleRoom': {
      const flame = Math.exp(-((vx - 0.48) ** 2) * 90 - ((vy - 0.62) ** 2) * 40);
      const pool = Math.exp(-((vx - 0.5) ** 2) * 6 - ((vy - 0.75) ** 2) * 3);
      const rim = Math.exp(-((vx - 0.2) ** 2) * 20) * (1 - vy) * 0.4;
      return Math.max(flame, pool * 0.75, rim);
    }
    case 'portraitWarm': {
      const face = Math.exp(-((vx - 0.52) ** 2) * 14 - ((vy - 0.4) ** 2) * 10);
      const shoulder = Math.exp(-((vx - 0.5) ** 2) * 6 - ((vy - 0.78) ** 2) * 12) * 0.55;
      return Math.max(face, shoulder);
    }
    case 'filmStrip': {
      const sprocket =
        (vx < 0.08 || vx > 0.92) && Math.abs(Math.sin(vy * Math.PI * 18)) > 0.55 ? 0.95 : 0;
      const panels = Math.abs(Math.sin(vy * Math.PI * 3 + s)) > 0.35 ? 0.65 : 0.2;
      return Math.max(sprocket, panels);
    }
    case 'lutPack': {
      const card = smoothstep(0.18, 0.25, vx) * (1 - smoothstep(0.75, 0.82, vx)) *
        smoothstep(0.22, 0.3, vy) * (1 - smoothstep(0.7, 0.78, vy));
      const swatch = Math.abs(vx - 0.5) < 0.12 && Math.abs(vy - 0.48) < 0.06 ? 0.9 : 0;
      return Math.max(card * 0.7, swatch);
    }
    case 'neonRain': {
      const rain = hash(Math.floor(vx * 80) * 13 + Math.floor(vy * 120) + seed) > 0.88 ? 0.75 : 0;
      const neon = Math.exp(-((vx - 0.35) ** 2) * 40) * (0.4 + 0.6 * Math.sin(vy * 20 + s));
      const ground = smoothstep(0.7, 0.95, vy) * (0.3 + 0.4 * Math.sin(vx * 30));
      return Math.max(rain * 0.5, neon * 0.85, ground);
    }
    case 'alley': {
      const vanishing = Math.exp(-((vx - 0.5) ** 2) * 22 - ((vy - 0.45) ** 2) * 8);
      const walls = Math.exp(-((Math.abs(vx - 0.5) - 0.28) ** 2) * 60);
      const lamp = Math.exp(-((vx - 0.62) ** 2) * 70 - ((vy - 0.28) ** 2) * 50);
      return Math.max(vanishing, walls * 0.65, lamp);
    }
    case 'streetPortrait': {
      const subject = Math.exp(-((vx - 0.45) ** 2) * 16 - ((vy - 0.42) ** 2) * 9);
      const bokeh = hash(Math.floor(vx * 20) * 31 + Math.floor(vy * 20) + seed) > 0.9 ? 0.7 : 0;
      return Math.max(subject, bokeh * (1 - subject));
    }
    case 'vinyl': {
      const cx = 0.5;
      const cy = 0.48;
      const d = Math.sqrt((vx - cx) ** 2 + (vy - cy) ** 2);
      const disc = smoothstep(0.34, 0.32, d) * (1 - smoothstep(0.08, 0.05, d));
      const grooves = Math.abs(Math.sin(d * 120)) * disc * 0.5;
      const label = smoothstep(0.09, 0.07, d);
      return Math.max(disc * 0.75, grooves, label);
    }
    case 'waveform': {
      const wave = Math.exp(-((vy - (0.5 + 0.18 * Math.sin(vx * 28 + s))) ** 2) * 120);
      const bars = hash(Math.floor(vx * 48) + seed) * smoothstep(0.35, 0.5, 1 - Math.abs(vy - 0.5) * 2);
      return Math.max(wave, bars * 0.7);
    }
    case 'micBooth': {
      const mic = Math.exp(-((vx - 0.5) ** 2) * 55 - ((vy - 0.45) ** 2) * 18);
      const grille = Math.abs(Math.sin(vy * 80)) * mic * 0.5;
      const foam = Math.exp(-((vx - 0.5) ** 2) * 8 - ((vy - 0.7) ** 2) * 20) * 0.45;
      return Math.max(mic, grille, foam);
    }
    case 'samplePack': {
      const box = smoothstep(0.2, 0.28, vx) * (1 - smoothstep(0.72, 0.8, vx)) *
        smoothstep(0.25, 0.32, vy) * (1 - smoothstep(0.68, 0.75, vy));
      const stripe = Math.abs(vy - 0.4) < 0.04 && vx > 0.25 && vx < 0.75 ? 0.85 : 0;
      return Math.max(box * 0.65, stripe);
    }
    case 'facade': {
      const cols = Math.abs(Math.sin(vx * Math.PI * 6 + s));
      const rows = Math.abs(Math.sin(vy * Math.PI * 8));
      const windows = cols > 0.55 && rows > 0.55 ? 0.8 : 0.15;
      const ledge = Math.abs(vy - 0.62) < 0.015 ? 0.7 : 0;
      return Math.max(windows, ledge);
    }
    case 'blueprint': {
      const grid =
        Math.abs(Math.sin(vx * Math.PI * 16)) < 0.08 || Math.abs(Math.sin(vy * Math.PI * 16)) < 0.08
          ? 0.55
          : 0.12;
      const plan = Math.exp(-((vx - 0.45) ** 2) * 10 - ((vy - 0.5) ** 2) * 14) * 0.7;
      const line = Math.abs(vy - (0.3 + vx * 0.4)) < 0.01 ? 0.85 : 0;
      return Math.max(grid, plan, line);
    }
    case 'uiKit': {
      const panel = smoothstep(0.15, 0.22, vx) * (1 - smoothstep(0.78, 0.85, vx)) *
        smoothstep(0.18, 0.25, vy) * (1 - smoothstep(0.75, 0.82, vy));
      const chips =
        vy > 0.35 && vy < 0.55 && hash(Math.floor(vx * 8) * 17 + seed) > 0.55 ? 0.75 : 0;
      return Math.max(panel * 0.6, chips * panel);
    }
    case 'communityHero': {
      const crowd = hash(Math.floor(vx * 22) * 53 + Math.floor(vy * 16) + seed) > 0.72 ? 0.6 : 0;
      const pool = Math.exp(-((vx - 0.5) ** 2) * 5 - ((vy - 0.78) ** 2) * 8) * 0.6;
      const beam = Math.exp(-((vx - 0.5) ** 2) * 30) * (1 - vy) * 0.5;
      return Math.max(crowd, pool, beam);
    }
    case 'btsDirecting': {
      const monitor = smoothstep(0.18, 0.24, vx) * (1 - smoothstep(0.62, 0.68, vx)) *
        smoothstep(0.3, 0.36, vy) * (1 - smoothstep(0.62, 0.68, vy));
      const glare = Math.exp(-((vx - 0.4) ** 2) * 60 - ((vy - 0.44) ** 2) * 90);
      const rig = Math.abs(vx - 0.78) < 0.02 ? 0.8 : 0;
      return Math.max(monitor * 0.7, glare, rig);
    }
    case 'artifactFrame': {
      const inside = Math.abs(vx - 0.5) < 0.3 && Math.abs(vy - 0.5) < 0.34;
      const edge =
        Math.abs(Math.abs(vx - 0.5) - 0.3) < 0.012 || Math.abs(Math.abs(vy - 0.5) - 0.34) < 0.012 ? 0.95 : 0;
      const burn = hash(Math.floor(vy * 60) * 31 + seed) > 0.94 ? 0.8 : 0;
      return Math.max(edge, inside ? 0.55 : 0.1, burn);
    }
    case 'photoHunt': {
      const grid =
        Math.abs(Math.sin(vx * Math.PI * 14)) < 0.06 || Math.abs(Math.sin(vy * Math.PI * 18)) < 0.06 ? 0.4 : 0.12;
      const road = Math.abs(vy - (0.35 + vx * 0.3)) < 0.02 ? 0.7 : 0;
      const pin = Math.exp(-((vx - 0.62) ** 2) * 700 - ((vy - 0.4) ** 2) * 700);
      return Math.max(grid, road, pin);
    }
    case 'hiddenTrack': {
      const reel = Math.exp(-((vx - 0.5) ** 2) * 24 - ((vy - 0.46) ** 2) * 24) * 0.7;
      const groove =
        Math.abs(Math.sin(Math.sqrt((vx - 0.5) ** 2 + (vy - 0.46) ** 2) * 150)) * reel * 0.7;
      const spark = Math.exp(-((vx - 0.72) ** 2) * 90 - ((vy - 0.66) ** 2) * 90);
      return Math.max(reel, groove, spark);
    }
    case 'blueprintArtifact': {
      const sheet =
        smoothstep(0.14, 0.2, vx) * (1 - smoothstep(0.8, 0.86, vx)) *
        smoothstep(0.16, 0.22, vy) * (1 - smoothstep(0.8, 0.86, vy));
      const lines =
        Math.abs(Math.sin(vx * Math.PI * 20)) < 0.05 || Math.abs(Math.sin(vy * Math.PI * 22)) < 0.05 ? 0.5 : 0.14;
      const block = vx > 0.34 && vx < 0.58 && vy > 0.4 && vy < 0.58 ? 0.85 : 0;
      return Math.max(sheet * lines, block);
    }
    case 'contactSheet': {
      const inside =
        (vx * 4) % 1 > 0.08 && (vx * 4) % 1 < 0.92 && (vy * 6) % 1 > 0.1 && (vy * 6) % 1 < 0.9;
      const cell = hash(Math.floor(vx * 4) * 97 + Math.floor(vy * 6) * 13 + seed);
      return inside ? 0.25 + cell * 0.6 : 0.08;
    }
    case 'albumArt': {
      const sleeve =
        smoothstep(0.1, 0.16, vx) * (1 - smoothstep(0.84, 0.9, vx)) *
        smoothstep(0.12, 0.18, vy) * (1 - smoothstep(0.82, 0.88, vy));
      const mark = Math.exp(-((vx - 0.5) ** 2) * 26 - ((vy - 0.5) ** 2) * 26);
      const band = Math.abs(vy - 0.36) < 0.02 && vx > 0.2 && vx < 0.8 ? 0.8 : 0;
      return Math.max(sleeve * 0.5, mark, band);
    }
    case 'interior': {
      const vanishing = Math.exp(-((vx - 0.5) ** 2) * 40 - ((vy - 0.48) ** 2) * 30);
      const ceiling = (1 - smoothstep(0.42, 0.46, vy)) * 0.3;
      const wall = Math.abs(vx - 0.5) > 0.3 ? 0.35 : 0;
      const floor = smoothstep(0.62, 0.68, vy) * 0.3;
      return Math.max(vanishing, ceiling, wall, floor);
    }
    case 'material': {
      const inside =
        (vx * 3) % 1 > 0.06 && (vx * 3) % 1 < 0.94 && (vy * 4) % 1 > 0.08 && (vy * 4) % 1 < 0.92;
      const swatch = hash(Math.floor(vx * 3) * 37 + Math.floor(vy * 4) * 71 + seed);
      return inside ? 0.3 + swatch * 0.55 : 0.06;
    }    default:
      return 0.35 + 0.3 * Math.sin(vx * 6 + s) * Math.cos(vy * 5);
  }
}

/** Cinematic still-like PNG with distinct scene structure per asset. */
function composePoster(width, height, mood, scene, seed) {
  const p = PALETTES[mood] ?? PALETTES.horror;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const cx = width * (0.38 + hash(seed) * 0.24);
  const cy = height * (0.32 + hash(seed + 3) * 0.28);
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
      const mask = sceneMask(scene, vx, vy, seed);

      let t = mix(vy, dist, 0.4);
      t = Math.max(0, Math.min(1, t));
      let r = mix(mix(p.a[0], p.b[0], t), p.c[0], t * t);
      let g = mix(mix(p.a[1], p.b[1], t), p.c[1], t * t);
      let b = mix(mix(p.a[2], p.b[2], t), p.c[2], t * t);

      // Lift subject / structure from scene mask
      r = mix(r, p.light[0], mask * 0.55);
      g = mix(g, p.light[1], mask * 0.48);
      b = mix(b, p.light[2], mask * 0.4);

      // Soft key light
      const light = Math.exp(-dist * dist * (4.5 + hash(seed + 9) * 3.5));
      r = mix(r, p.light[0], light * 0.35);
      g = mix(g, p.light[1], light * 0.28);
      b = mix(b, p.light[2], light * 0.22);

      // Directional streak
      const proj = (vx - 0.5) * Math.cos(streakAngle) + (vy - 0.5) * Math.sin(streakAngle);
      const streak = Math.exp(-Math.abs(proj) * 16) * (0.1 + hash(seed + x + y) * 0.08) * (0.4 + mask);
      r = mix(r, p.light[0], streak);
      g = mix(g, p.light[1], streak * 0.85);
      b = mix(b, p.light[2], streak * 0.7);

      // Chromatic film edge for horror scenes
      if (mood.startsWith('horror')) {
        const edge = smoothstep(0.78, 1, Math.max(Math.abs(vx - 0.5) * 2, Math.abs(vy - 0.5) * 2));
        r = mix(r, p.c[0], edge * 0.25);
        b = mix(b, p.a[2], edge * 0.2);
      }

      // Vignette
      const vig = Math.min(1, dist * 1.25 + (1 - mask) * 0.15);
      r *= 1 - vig * 0.58;
      g *= 1 - vig * 0.58;
      b *= 1 - vig * 0.62;

      // Grain + slight color noise
      const grain = (hash(seed * 10007 + x * 131 + y * 917) - 0.5) * 22;
      const chroma = (hash(seed * 5011 + x * 17 + y * 41) - 0.5) * 8;
      r += grain + chroma;
      g += grain * 0.9;
      b += grain * 0.85 - chroma * 0.5;

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
    const body = composePoster(720, 960, poster.mood, poster.scene, poster.seed);
    const bucket = poster.bucket ?? 'public-media';
    const { error } = await supabase.storage.from(bucket).upload(poster.path, body, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });
    if (error) fail(`${poster.path}: ${error.message}`);
    uploaded += 1;
  }
  console.log(`upload-vault-fixture-media: uploaded ${uploaded} cinematic scene posters (public + private)`);
}

if (process.argv[1]?.includes('upload-vault-fixture-media')) {
  main().catch((error) => fail(error?.message ?? String(error)));
}
