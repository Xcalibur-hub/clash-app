# Arena Phase 3.2E — Android Take composer fixes

Date: 2026-10-15. Branch `feat/arena-v2-editorial-ui` from `faa4c05`. PR #65 stays **DRAFT**; no merge, deployment or hosted Supabase access. Reads `docs/ARENA_ANDROID_VISUAL_VERIFICATION_3_2D.md` first. Scope: the confirmed Android Take-composer defects only — no unrelated UI redesign.

## Isolation

Samsung `SM-A505F` (`RZ8M30DE9NL`) over USB, existing debug build `com.clash.v2.dev`, Metro on `localhost:8081`, shared local stack gateway `127.0.0.1:55321`. No native rebuild, no app-data clear, no JWT manipulation, no DB reset or migration, no disposable stack.

## Changes

| File | Change |
|---|---|
| `app/(tabs)/create.tsx` | CTA/footer driven by one `publishPhase`; keyboard-aware layout; friendly rejected-publish copy; draft-upload reclamation on abandon |
| `utils/takeComposerState.ts` (new) | Pure phase/copy functions (`publishPhase`, `publishCtaLabel`, `publishHelperCopy`, `isPublishEnabled`), duplicate detection (`isDuplicateTakeRejection`, `publishFailureCopy`), reclamation guard (`canReclaimDraftUpload`) |
| `hooks/useKeyboardVisible.ts` (new) | Tracks `keyboardDidShow/Hide` so screens stop stacking the home-indicator inset on top of IME padding |
| `services/mediaService.ts` | `discardUpload(plan, { videoPoster })` — deletes only the one approved plan (object + video poster sibling) then tombstones that media row |
| `package.json` | Registers `utils/takeComposerState.test.ts` in `test:unit` |

**Keyboard (defect 1).** The activity declares `adjustResize`, but Android here is edge-to-edge and the IME window is full-height with `sim={adjust=pan}` (`mFrame=[0,83][1080,2340]`), so the window never shrank and the footer stayed behind the keyboard. The composer now uses `KeyboardAvoidingView behavior="padding"` (same as `app/take/[takeId].tsx`) and drops the home-indicator inset while the IME is up — no stacked padding, no blank gap. iOS keeps `padding` exactly as before.

**Footer copy (defect 2).** `publishPhase` distinguishes `uploading`, `publishing`, `empty`, `over_limit`, `question_incomplete`, `ready`. "Write something first." is now only shown for a genuinely empty draft; upload/publish show "Uploading your media…" / "Publishing your take…", and an over-limit draft says "Shorten your take by N characters."

**Duplicate publish (defect 3).** `P0006` + `already dropped this take` is matched specifically (other `P0006` guards such as Clash/Rebuttal/Vault keep their own messages) and replaced with "You already dropped this take. Edit it, then publish again." The draft is untouched (`create.tsx` catch keeps it, as before).

## Rejected-duplicate media: investigated, deliberately **not** deleted

A rejected publish leaves its upload behind: media bytes are uploaded *before* `create_take` runs (`create.tsx` `uploadMedia` → `postTake`), so a rejection orphans one object.

**Safe cleanup cannot be established at rejection time.** The same uploaded object is reused by the user's corrected retry: `drop()` caches it in `uploaded.current` and only re-uploads when the picked media changes (observed natively in 3.2D — the retry after `P0006` published the *same* plan without a second upload). Deleting on `P0006` would break that retry and could leave a published Take pointing at a missing object.

**What is implemented instead** — a narrowly scoped reclamation that runs only when the draft itself is abandoned, never on a retryable failure:

- `discardUpload(plan, { videoPoster })` touches exactly one approved plan: `plan.path` (+ its `_poster.jpg` sibling for video) and tombstones only that `media_objects` row.
- `delete_media` is owner-scoped (`not your media` → `P0001`), so another user's media is unreachable from this path.
- `canReclaimDraftUpload` refuses to act once the draft's media has been published (`published: true`), so published/shared objects are never deleted.
- Called from `doDismiss()` only (explicit ✕-discard or leaving an empty draft); the "Keep editing" path and every rejected publish keep the upload for retry.

**Documented limitation:** an orphan stays in `public-media` if the user leaves the composer in a way that bypasses discard (app kill, crash, process death). A server-side sweep over unreferenced `media_objects` older than N hours is the correct follow-up; it is out of scope here because it would change schema/behaviour beyond these defects.

## Native verification (device evidence)

| Check | Result | Evidence |
|---|---|---|
| Keyboard open + text entered + **publish CTA reachable** | **PASS** | IME visible top `1359` (`InsetsSource type=ITYPE_IME`), `mInputShown=true`; tapping the CTA at `y=1220` (≈139 px clear of the IME) fired `POST /rest/v1/rpc/create_take → 200` (`okhttp/4.12.0`) + `take_created` |
| Successful publish | **PASS** | Three `create_take → 200` publishes after the change (07:46:06, 07:49:35, 07:51:10 UTC), each followed by `arena_viewed` |
| Video attachment | **PASS** | `OPEN_DOCUMENT typ=video/*` from uid 10563; video plate with duration; publish stored `media=m_3031102852e882e003c3a724` on the Take row |
| Image attachment | **PASS (3.2D lineage, same build family)** | `TakeMediaPreview` + 182,588-byte PNG upload to `public-media` (`storage.object.upload`, `runtime=react-native`) |
| Duplicate rejection, **draft preserved** | **PARTIAL** | Three rejected publishes (HTTP 400) each left **no new Take row** and the draft intact (text still in the field: 4,502 bright pixels in the input box), app staying on the composer |
| Correct loading/footer copy | **PASS (unit + wiring)** | 9 tests assert every phase's CTA label and helper copy; native capture of those strings was blocked (tooling, below) |
| No keyboard overlap / blank gap | **PASS** | CTA `y=1220` fully above IME top `1359`; inset stacking removed while the IME is up |

**Blocker encountered:** the local stack enforces `assert_rate_limit(v_actor, 'take_create', 5, interval '1 hour')`, so the P0006 path became unreachable mid-run (`ERROR: rate limit exceeded: take_create`, `enforce_take_create_limits`). The quota (07:17–07:51) was consumed by this verification. Editing `rate_limit_events` on the **shared** database is out of scope, so native P0006 reproduction is deferred; the guard itself was reproduced natively on this stack earlier (Kong `500` + `{"code":"P0006","message":"you already dropped this take"}`).

**Tooling blocker:** the Cline image reader intermittently rejected screenshots mid-session, so later native assertions use pixel metrics (IME frame, bright-pixel counts, behavioural publish detection) instead of image reading. `uiautomator dump` remains blocked on this device (`could not get idle state`).

## Tests

- `node --experimental-strip-types --test utils/takeComposerState.test.ts` → **9/9 pass, exit 0**
- `npm run test:unit` → **486/486 pass, 486 tests, exit 0** (was 477)
- `npx tsc --noEmit` → **exit 0** (strict, no `any`)

## Still open (not fixed here)

- **Take-detail hero overlap** (from 3.2D, reconfirmed): a two-line Take body overlaps the "Your Feed" summary block in `app/take/[takeId].tsx`.
- Rate limiter consumed on the shared stack until its hour window rolls over.
- Reduce-motion still unsupported; TalkBack label quality still unverified (no node dump on this device).
