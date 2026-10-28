# Phase 4G — Populated Vault episode and reader acceptance

## Phase 4G.2 update — 27 October 2026

**PASS for authorized free media Drop, populated collection → poster → DropReader native rendering on Samsung A50.** One UI fix for QA-gateway public media Image loads. No commit, push, merge or deployment.

HEAD start/end: `cbe216a3c212a83c432f71b37b59a1debe5caa63`. Ancestors preserved: `6ca9222`, `cbe216a`. Unrelated uncommitted work preserved. Fixtures retained for separately authorized cleanup.

### Baseline (reverified)

| Check | Result |
|---|---|
| Branch | `arena-ui-review` |
| QA identity | `http://127.0.0.1:55481/__qa/identity` → `clash-ui-qa-phase4a`, system id `7700622043081482277` |
| Application migrations | **111**; cron run details **0** |
| Device | `SM-A505F` / `RZ8M30DE9NL` / `com.clash.v2.dev`, PID **2546** |
| USB reverse | `8081`, `55481` |
| Actor on device | Fictional **A** (`Local Supabase session`) |
| Creator / Vault / Collection | B `u_d2af864cce5b4e72a9ff5ff56586f522` / `v_a93552e1a94a3538` / `vc_954bfedaebd5b811` |
| Port 55321 media helper | **Not run** |

### Authorized fixture (exactly one)

Authenticated as B via reviewed QA magic-link → OTP (same pattern as 4F.2). Synthetic nonpersonal 96×96 PNG (teal field + cream band). No device library / personal images.

| Step | Contract | Result |
|---|---|---|
| `create_media_upload` | image / `image/png` / `public` | `m_b46a151103fead7ac59aa114` → `public-media` |
| Storage upload | authorized path | object present |
| `complete_media_upload` | size 461, 96×96 | `status=ready` |
| Authenticated download | B session | 461 bytes, sha256 `4cfe9a2da88861637dbc5b4f96b2319b78167b9614490122152d1219c9d6f24b` |
| Anon public GET | gateway + anon `apikey` | HTTP **200** (bare GET without key = **401** — gateway rule) |
| `create_vault_drop` | `access_level=free` + media | draft then publish |
| `publish_vault_drop` | server window | published `2026-10-27T10:27:39Z` → expires `2026-11-03T10:27:39Z` (**7d**) |
| `add_drop_to_collection` | `vc_954bfedaebd5b811` | position **0** |

| Field | ID / value |
|---|---|
| Media | **`m_b46a151103fead7ac59aa114`** |
| Storage path | `u_d2af864cce5b4e72a9ff5ff56586f522/m_b46a151103fead7ac59aa114/m_b46a151103fead7ac59aa114.png` |
| Drop | **`vd_1a4dd9af3f6980b2`** |
| Caption | `[QA fictional 4G.2] Free Field Note — synthetic poster only` |
| Collection item | `vc_954bfedaebd5b811` ↔ `vd_1a4dd9af3f6980b2` |
| Routes | `/vault/collection/vc_954bfedaebd5b811`, `/vault/drop/vd_1a4dd9af3f6980b2` |

Manifest: [fixture-4g2.json](fixture-4g2.json). Private scripts/logs under `.expo/ui-completion-phase4g-vault/`. No second Drop. No private media, subscription, purchase or entitlement override.

### UI defect fixed

**Symptom:** DropReader showed “Couldn't load Media” while `vault_drop_card` returned `accessible:true` and `publicMedia` for A. Bare `Image` GETs to `http://127.0.0.1:55481/storage/v1/object/public/...` receive gateway **401** without `apikey`.

**Fix (minimal):** `utils/publicMediaImageSource.ts` builds RN Image `source` with publishable `apikey` + `Authorization` headers. Wired into `VaultReaderMedia`, `EditorialMedia`, `VaultMediaTile`, `MediaViewer`. Re-exported from `mediaService`. Unit coverage in `utils/publicMediaImageSource.test.ts` (added to `test:unit`).

No migrations, grants, RLS, scheduler or gateway process changes.

### Native acceptance (A50, fictional A)

Navigation: Search → People `@qa4c_b_1d1e36` → **Enter QA's Vault** → scroll → **Open collection QA Field Notes** → FREE episode → DropReader. (Also verified creator-world poster strip shows the episode.)

| Check | Result | Evidence |
|---|---|---|
| Creator Vault populated | PASS | `45-creator-final` / `46-creator-scrolled-final` — TONIGHT + SERIES **1 episode** |
| Collection shows episode poster/card | PASS | `44-collection-final` — FREE card, title, **6d left** |
| Tap → `/vault/drop/vd_1a4dd9af3f6980b2` | PASS | Reader caption + creator + Free |
| DropReader public media **visible** | PASS | Accessibility `Content media` `[42,725][1038,1970]`; screenshot shows synthetic teal/cream PNG (not tint-only) |
| Title / creator / Free / expiry | PASS | Caption, QA Mira, Free, 6d left |
| Access without subscription | PASS | Free badge; no purchase CTA on reader |
| Membership info still non-transacting | PASS (prior) | Sheet: purchases unavailable / nothing charged |
| Back → collection | PASS | `39-after-back` |
| Re-entry → reader + media | PASS | `40-reader-reentry` / `43-reader-final` |
| Dark theme reader | PASS | `43-reader-final` |
| Light / 1.3× matrix | LIMITED | Light uimode briefly retained Content media node; full dual-theme + 1.3× not re-swept |
| API free access as A | PASS | `viewer_can_access_drop=true`; card `accessible=true` — [a-free-access.json](a-free-access.json) |

Private captures: `.expo/ui-completion-phase4g-vault/{43,44,45,46}-*-final.png` (+ previews). Hashes: [screenshots-4g2.json](screenshots-4g2.json).

**Distinction:** Authenticated/anon Storage GET of 461 bytes proves downloadability; native `Content media` bounds + screenshot prove on-device rendering after the header fix.

### Validation

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, **812 + 234 = 1,046** tests, 0 fail |
| `node --test scripts/vault-collection-navigation.test.cjs` | PASS, **3** |
| `node --experimental-strip-types --test utils/publicMediaImageSource.test.ts` | PASS, **2** |

### PASS / FAIL / BLOCKED matrix

| Item | Status |
|---|---|
| Baseline QA / A50 / B / collection | PASS |
| One synthetic public PNG as B | PASS |
| One free published Drop + collection item | PASS |
| Native collection → poster/card → DropReader | PASS |
| Visible public media on reader | PASS (after fix) |
| Free access without purchase | PASS |
| Private/subscriber/paid paths | Not authorized / not created |
| TypeScript / unit / Vault tests | PASS |
| Commit / push / deploy | Not performed |

### Files touched (uncommitted)

- `utils/publicMediaImageSource.ts` (+ test)
- `services/mediaService.ts` (re-export)
- `components/vault/VaultReaderMedia.tsx`
- `components/vault/world/EditorialMedia.tsx`
- `components/vault/VaultMediaTile.tsx`
- `components/shared/MediaViewer.tsx`
- `package.json` (`test:unit` entry)
- this report + evidence JSON

Preserve media `m_b46a151103fead7ac59aa114`, Drop `vd_1a4dd9af3f6980b2`, and Play fixture `ec_9d69882d0dc1eb53` until separately authorized cleanup. **STOP.**

---

## Phase 4G.1 (prior) — blocked without media

27 October 2026. Empty collection honesty PASS; populated episode **BLOCKED** pending the write authorization that 4G.2 executed. Publish without media remains unsupported (`P0008`). See git history of this file / prior section content in conversation evidence if needed.
