/**
 * LOCAL DEV ONLY — backfill `takes.media_poster_url` for video Takes that lack one.
 *
 * Safe guards:
 * - Refuses non-local Supabase API URLs / containers
 * - Never touches hosted/production projects
 *
 * Strategies (in order):
 * 1. Real storage videos (media_object_id set): download → ffmpeg frame @1s →
 *    upload `{path}_poster.jpg` beside the video → update take
 * 2. Fixture / placeholder videos (no storage object): assign a curated JPEG poster
 *
 * Usage: npm run dev:backfill-video-posters
 *
 * Requires: Docker + local `supabase start`. Optional: ffmpeg on PATH for (1).
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const CONTAINER = 'supabase_db_clash';
const API_PORT = 55321;

/** Public demo service_role JWT for local supabase start (never for hosted). */
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const FIXTURE_POSTER =
  'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&h=900&fit=crop';

function fail(msg) {
  console.error(`backfill-video-posters: ${msg}`);
  process.exit(1);
}

function readStatusEnv() {
  const result = spawnSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
    cwd: ROOT,
  });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const api = text.match(/API_URL="([^"]+)"/)?.[1];
  const service = text.match(/SERVICE_ROLE_KEY="([^"]+)"/)?.[1];
  return { api, service, ok: result.status === 0 && Boolean(api) };
}

function assertLocalContainer() {
  const listed = spawnSync(
    'docker',
    ['ps', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  const names = (listed.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!names.includes(CONTAINER)) {
    fail(
      `Local container "${CONTAINER}" is not running.\n` +
        'Run: npm run supabase:start\n' +
        'This script never targets hosted/production.',
    );
  }
}

function posterPathForVideo(videoPath) {
  const slash = videoPath.lastIndexOf('/');
  const dir = slash >= 0 ? videoPath.slice(0, slash + 1) : '';
  const file = slash >= 0 ? videoPath.slice(slash + 1) : videoPath;
  const base = file.replace(/\.[^.]+$/, '') || file;
  return `${dir}${base}_poster.jpg`;
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

async function main() {
  assertLocalContainer();
  const status = readStatusEnv();
  const apiUrl = status.api ?? `http://127.0.0.1:${API_PORT}`;
  if (!/127\.0\.0\.1|localhost/i.test(apiUrl)) {
    fail(`Refusing non-local API_URL: ${apiUrl}`);
  }
  const serviceKey = status.service ?? LOCAL_SERVICE_ROLE;
  const supabase = createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from('takes')
    .select('id, text, media_url, media_object_id, media_poster_url, media_kind')
    .eq('media_kind', 'video')
    .is('media_poster_url', null);

  if (error) fail(error.message);
  const missing = rows ?? [];
  if (missing.length === 0) {
    console.log('No video takes need a poster. Done.');
    return;
  }

  console.log(`Found ${missing.length} video take(s) without posters.`);
  const ffmpegOk = hasFfmpeg();
  if (!ffmpegOk) {
    console.warn('ffmpeg not on PATH — storage videos will get the fixture JPEG poster.');
  }

  let updated = 0;
  for (const take of missing) {
    let posterUrl = null;

    if (take.media_object_id && ffmpegOk) {
      const { data: media, error: mediaErr } = await supabase
        .from('media_objects')
        .select('id, bucket, storage_path, status')
        .eq('id', take.media_object_id)
        .maybeSingle();
      if (mediaErr) {
        console.warn(`  skip ${take.id}: ${mediaErr.message}`);
      } else if (media && media.status === 'ready' && media.bucket === 'public-media') {
        const dir = mkdtempSync(join(tmpdir(), 'clash-poster-'));
        const videoFile = join(dir, 'source.bin');
        const posterFile = join(dir, 'poster.jpg');
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from(media.bucket)
            .download(media.storage_path);
          if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed');
          const buf = Buffer.from(await blob.arrayBuffer());
          writeFileSync(videoFile, buf);
          const ff = spawnSync(
            'ffmpeg',
            ['-y', '-ss', '1', '-i', videoFile, '-frames:v', '1', '-q:v', '3', posterFile],
            { encoding: 'utf8' },
          );
          if (ff.status !== 0 || !existsSync(posterFile)) {
            throw new Error(ff.stderr?.slice(-400) || 'ffmpeg failed');
          }
          const posterPath = posterPathForVideo(media.storage_path);
          const bytes = readFileSync(posterFile);
          const { error: upErr } = await supabase.storage
            .from(media.bucket)
            .upload(posterPath, bytes, { contentType: 'image/jpeg', upsert: true });
          if (upErr) throw new Error(upErr.message);
          posterUrl = supabase.storage.from(media.bucket).getPublicUrl(posterPath).data.publicUrl;
        } catch (err) {
          console.warn(
            `  ${take.id}: frame extract failed (${err instanceof Error ? err.message : err}) — using fixture poster`,
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    }

    if (!posterUrl) {
      // Seed / remote placeholder videos — intentional curated still, not the mp4.
      posterUrl = FIXTURE_POSTER;
    }

    const { error: updErr } = await supabase
      .from('takes')
      .update({ media_poster_url: posterUrl })
      .eq('id', take.id);
    if (updErr) {
      console.warn(`  fail ${take.id}: ${updErr.message}`);
      continue;
    }
    updated += 1;
    console.log(`  ✓ ${take.id} → poster set`);
  }

  console.log(`Done. Updated ${updated}/${missing.length} take(s).`);
  console.log('Reload Arena in the app to see posters.');
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
