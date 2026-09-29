# Vault private media — access architecture

How subscriber-only Vault content is served, why it cannot leak, and what was
actually verified where. Companion to `supabase/SCHEDULER.md`.

## The rule

A subscriber Drop is backed by an object in the **`private-media`** bucket. That
bucket is `public: false`, and its Storage RLS policy (`migration 0004`) grants
reads to the object's owner only — so there is no public URL to hide, no
obscure path to guess against, and no CDN edge copy. Access is a server decision
made per request, not a UI state.

The database also refuses to hold the wrong pairing: `media_objects` carries
`check ((visibility = 'public' and bucket = 'public-media') or (visibility =
'private' and bucket = 'private-media'))`, and the `vault_drops` trigger
`enforce_vault_drop_media()` rejects a `subscriber` Drop whose media is public
(err `P0005`) and a `free` Drop whose media is private (`P0006`).

The **storefront** (`vault_storefront(vault_id)` / `vault_drop_card(drop_id)`) is
deliberately metadata-only for the same reason. It returns a caption, an access
level, a status, the server's `accessible` decision and collection membership, plus
a bucket/path **only for a free Drop the caller may read** (free media already sits
in the public bucket). A subscriber Drop comes back with `publicMedia: null`, so
listing a Vault can never leak a private location and never needs a signed URL per
card — the bytes are fetched once, in the reader, at the moment they are opened.

## The request path

```
Expo client
  │  POST /functions/v1/vault-media-access     { dropId }        Bearer <user JWT>
  ▼
vault-media-access (Edge Function, verify_jwt = true)
  │  1. as the CALLER  → rpc('vault_drop_media_target', { p_drop_id })
  ▼
Postgres
  │  2. resolves the viewer from the verified JWT (my_profile_id())
  │  3. runs the ONE entitlement helper: can_access_vault_drop(viewer, drop)
  │  4. returns { bucket, path, mediaKind } — or no row at all
  ▼
vault-media-access
  │  5. as the SERVICE (service key, runtime env only)
  │     storage.from(bucket).createSignedUrl(path, 120)
  ▼
Expo client  ←  { url, bucket, mediaKind, expiresIn: 120 }
```

Five properties fall out of that shape:

1. **The service-role key never leaves the runtime.** It is read from
   `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside the function, is never
   returned in a response, and is never bundled into Expo (the app only ever
   holds the publishable anon key, which is governed by RLS).
2. **The viewer is resolved server-side.** The request body carries a Drop id and
   nothing else. There is no viewer id to spoof, and the function ignores any
   that might be smuggled in.
3. **Postgres decides entitlement, not the function.** No rows means *no*: no
   entitlement, a block in either direction, a retracted Drop, or a tombstoned
   object. The function returns 403 and never touches Storage.
4. **Nothing permanent is stored.** Signed URLs are minted per request, valid for
   120 seconds, and written to no table, no cache and no log.
5. **One implementation.** The RLS policies, the Edge Function and the app's
   `canAccessDrop` all call `public.can_access_vault_drop`, so an entitlement rule
   can never drift between them.

## Entitlement rules (`can_access_vault_drop`)

| Viewer | Reads |
| --- | --- |
| the creator | their own Drop, always — drafts, expired and tombstoned included (tombstoned only for `deleted_at is null`) |
| anyone | a `free`, published Drop inside its window |
| anyone | a **collected** Drop, live or expired — this is Collection permanence |
| a subscriber | `subscriber` Drops while their entitlement is `active`/`trial` and `current_period_end > now()` |
| a signed-out guest | `free` Drops only; never subscriber media, never a media target |
| a blocked viewer (either direction) | nothing from that creator — a block beats a live entitlement |
| the creator, blocked | still their own content |

A `mute` is deliberately **not** consulted here: a mute is a feed preference for
content the viewer did not ask to see, whereas a Vault is a destination they
navigated to on purpose. Blocks are the safety boundary; mutes are not.

## Config

`supabase/config.toml`:

```toml
[functions.vault-media-access]
enabled = true
verify_jwt = true
```

`verify_jwt = true` means the platform rejects an unauthenticated call before the
function body runs. The function additionally calls `auth.getUser()` as defence
in depth, so it is safe even if it is ever served without platform verification.

### Type-checking

`supabase/functions/` is excluded from the app's `tsconfig.json`: the function is a
Deno module (`Deno.serve`, `Deno.env`, an `https://esm.sh` import), so the Expo
compiler cannot resolve it and it must not be pulled into the React Native bundle.
It is verified by running it, not by `tsc` — see below. `deno check` against a
Deno-installed toolchain is the natural addition if that becomes part of CI.

## Verification status

### Verified locally — Edge Function executed for real

`supabase functions serve vault-media-access` (edge runtime 1.69.8, Deno 2.1.4)
was started against the local stack and driven with real requests. All 13
assertions passed:

- unauthenticated call → **401**
- signed-in non-subscriber → **403**
- unknown Drop id → **403**
- the creator → **200**, `expiresIn: 120`, signed `private-media` URL
- subscriber with a server-side grant → **200**, and the returned signed URL
  **actually served the uploaded bytes** (200, exact byte length)
- a direct fetch of the private object path → **blocked**

One local-only caveat: inside the runtime `SUPABASE_URL` is `http://kong:8000`,
so the *local* signed URL carries that internal hostname. The harness rewrote it
to `http://127.0.0.1:55321` to fetch it. On a hosted project `SUPABASE_URL` is the
public project URL, so the URL is directly usable — no rewrite, no behaviour
change.

### Verified locally — the database half, permanently

`supabase/tests/012_vault_access.sql` and `011_vault_creator.sql` cover the
entitlement rules, media rules, expiry, permanence and privileges on every
`supabase test db` run, so the decision the function depends on is continuously
guarded rather than verified once.

### Still to verify after a hosted deploy

1. `supabase functions deploy vault-media-access` (uses the config above).
2. Confirm `verify_jwt` is reported as enabled for the function.
3. As a non-subscriber: `POST /functions/v1/vault-media-access` → expect **403**.
4. Grant a test entitlement (`select public.vault_grant_test_subscription(...)`
   with the service key), then repeat → expect **200** with a working URL.
5. Fetch that URL with no `Authorization` header → expect the bytes, which proves
   the token alone authorises the object.
6. Re-run step 3 after
   `select public.vault_revoke_subscription(...)` → expect **403** again.
