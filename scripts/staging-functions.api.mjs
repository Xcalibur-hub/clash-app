/**
 * Management API client for the staging function workflow (Phase 11 Step 14 fix).
 *
 * Why this exists: the pinned Supabase CLI (2.40.7) `functions list` prints a
 * human table, ignores `-o json`, and never reports `verify_jwt`, so it cannot
 * back the strict inventory verification. The Management API does, and the
 * staging token can read it (HTTP 200 with an empty list before deployment).
 *
 * The token is supplied by the caller and is used only as an Authorization
 * header — never logged, never written to evidence, never an argument.
 */
import { redact } from './staging-functions.lib.mjs';
import { PROJECT_REF } from './staging-functions.manifest.mjs';

export const MANAGEMENT_API = 'https://api.supabase.com/v1';

async function apiGetJson(url, token) {
  if (!token) throw new Error('refusing: no management token in the environment');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`refusing: management api ${res.status} for ${url.replace(MANAGEMENT_API, '')}: ${redact(text).slice(0, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('refusing: management api returned a non-JSON body');
  }
}

/** Pure normalizer: API rows -> the inventory shape used by the strict checks. */
export function normalizeApiInventory(rows) {
  if (!Array.isArray(rows)) throw new Error('refusing: unexpected functions inventory payload (not an array)');
  return rows.map((x) => ({
    name: String(x.slug ?? x.name ?? ''),
    verify_jwt: typeof x.verify_jwt === 'boolean' ? x.verify_jwt : null,
    version: x.version ?? null,
    updated_at: x.updated_at ?? null,
  }));
}

/** Deployed function inventory for the pinned project (verify_jwt included). */
export async function fetchFunctionsInventory(token, ref = PROJECT_REF) {
  return normalizeApiInventory(await apiGetJson(`${MANAGEMENT_API}/projects/${ref}/functions`, token));
}

/** Secret NAMES only — the API's `value` field is never returned to the caller. */
export async function fetchSecretNames(token, ref = PROJECT_REF) {
  const rows = await apiGetJson(`${MANAGEMENT_API}/projects/${ref}/secrets`, token);
  if (!Array.isArray(rows)) throw new Error('refusing: unexpected secrets payload (not an array)');
  return rows.map((r) => String(r.name ?? r.Name ?? '')).filter(Boolean);
}
