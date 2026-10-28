# CLASH UI evidence index for GitHub review

28 October 2026. Publication branch `review/clash-full-ui-evidence-20261028`, based on **`4adeed3b1c00908ede73916cf868e3265fc0399d`** (`arena-ui-review` local HEAD).

This index is a map. Historical reports are **not rewritten**. Status labels:

| Label | Meaning |
|---|---|
| **Implemented** | Source exists on this branch |
| **Device-tested** | Samsung SM-A505F evidence exists (this pack or a cited GitHub commit) |
| **Proposed** | UI-1 blueprint/roadmap only; not implemented |
| **Unverified** | Source exists; no current on-device proof in this pack |
| **Deferred** | Beta `releaseScope` blocks new admission (Meet, Groups join/create, Play join, Vault compose, etc.) |

Repository: https://github.com/Xcalibur-hub/clash-app
Remote `origin/arena-ui-review` at publication time was **12 commits behind** this base (`0cd6c36`). This review branch carries the local HEAD so reviewers see current UI source plus newly attached reports.

---

## How to review

1. Start here, then [FULL_APP_VISUAL_AUDIT.md](./FULL_APP_VISUAL_AUDIT.md), [DESIGN_SYSTEM_BLUEPRINT.md](./DESIGN_SYSTEM_BLUEPRINT.md), [UI_IMPLEMENTATION_ROADMAP.md](./UI_IMPLEMENTATION_ROADMAP.md).
2. Open screenshot folders linked per section.
3. Treat older GitHub design branches as **historical** if they pre-date the Phase 4–5 freeze (`d268cd4` / `cbe216a` lineage).

Tracked screenshot sets already in git at this base (also on this branch):

- [`docs/evidence/arena-demo-mode/`](../../evidence/arena-demo-mode/) — light/dark Home, Live, Groups, Discover, Room, Take (demo data)
- [`docs/evidence/arena-design-system-v1/`](../../evidence/arena-design-system-v1/) — Take 320/360 + font-scale
- [`docs/evidence/arena-live-v2/`](../../evidence/arena-live-v2/) — Live/room/challenge 320/360/430 before/after
- [`docs/evidence/arena32c/`](../../evidence/arena32c/) — guest home, room, light theme
- [`docs/evidence/explore-e28/`](../../evidence/explore-e28/) and [`explore-e29/`](../../evidence/explore-e29/) — World globe/picker
- [`docs/evidence/explore-e372/screens/`](../../evidence/explore-e372/screens/) — Meet typing (continuation UI; **admission still deferred**)

Newly attached in this publication (were untracked):

- [`docs/evidence/ui-completion/screenshots/`](./screenshots/) — 28 Oct 2026 A50 (selected safe frames)
- [`docs/evidence/arena-live-v2/phone-review/`](../arena-live-v2/phone-review/) — A50 Live/Crowd/keyboard dark+light

---

## GitHub commits and branches (already on origin)

Do not treat these as the current checkout. Use them as prior design/implementation history.

| Ref | Role |
|---|---|
| `origin/design/arena-design-system-v1` (`f8e093d`) | Design system + editorial Take (`docs/ARENA_DESIGN_SYSTEM_V1.md`, PR **#75** cited in that doc) |
| `origin/design/arena-unified-ui-pass-20261016` | Live duel stage hierarchy |
| `origin/design/arena-live-editorial-pass-20261015` | Editorial Live pass |
| `origin/feat/arena-visual-completion-a-20261017` | Feed / Live discovery / constellation |
| `origin/feat/arena-live-stage-approved-design` | Approved stage |
| `origin/feat/arena-groups-hybrid-20261016` | Groups hybrid |
| `origin/feat/arena-v2-editorial-ui` | Arena v2 editorial |
| `origin/docs/explore-1g-world-integration-plan` | World map plan |
| `origin/feat/explore-1c-world-discovery` … `1g-*` | Explore World / MapLibre series |
| Local freeze `d268cd4` | `feat(ui): freeze Phase 4–5 Arena, World, Vault and Take corrections` (**not on origin/arena-ui-review yet**; is on this review branch) |
| Local `4adeed3` | Current source + Meet admission tests |

Tracked design docs on this base: `docs/ARENA_DESIGN_SYSTEM_V1.md`, `docs/ARENA_LIVE_EXPERIENCE_V2.md`, `docs/ARENA_FINAL_UI_INTEGRATION_20261018.md`, `docs/ARENA_GROUPS_LIVE_INTEGRATION_20261017.md`, `docs/ARENA_VISUAL_COMPLETION_WORKSTREAM_A.md`, `docs/EXPLORE_AUDIT.md`, `CLASH_SPEC.md` §4 visual direction.

---

## App sections

### Home / For You / Fresh Takes

| | |
|---|---|
| Routes | `app/(tabs)/index.tsx` (mode `for_you`) |
| Components | `ArenaTopBar`, `FreshTakesSection`, `TakeFeedItem` / `TakeFeedCard`, `RealmTabBar` |
| Implemented | Yes — editorial feed, scopes For You / Following / Popular |
| Device-tested | Phase 4C report: populated Fresh Takes on A50. **Not recaptured 28 Oct** (session opened on Live) |
| This pack | Live empty/gateway: `screenshots/02-after-back`, `03-home-tab`, `15-resume2`. Demo Home: tracked `arena-demo-mode/dark-home.png` |
| Incomplete | IA: Home vs Live vs Explore duplication; Demo Arena chrome on A50 |
| Proposed | Roadmap Batch 1 — two modes only (For You \| Live) |

### Arena Live / Room / Verdict / Spectators

| | |
|---|---|
| Routes | `app/arena/room/[roomId].tsx`, `app/clash/[takeId].tsx`, `app/arena/challenges.tsx`, `app/demo-arena.tsx` |
| Components | `DuelRoomExperience`, `LiveRoom*`, `VerdictReveal`, `ClashResultView`, `ArenaLiveGateway` |
| Implemented | Yes — canonical duel stage, crowd, judging, result |
| Device-tested | 4C Live/Stage/Crowd; 4C Crowd keyboard fix; 5G fighter native (cited in freeze docs); 28 Oct **settled result** |
| This pack | `screenshots/01-resume` (settled); `arena-live-v2/phone-review/*`; tracked `arena-live-v2/dark-room-after-*.png` |
| Bugs | Result orbs overlap type; “SPLIT DECISION” still on settled UI; Live chip cathedral + empty snapshot |
| Conflicting | 4C called Crowd keyboard FAIL then PASS after fix. Phase 3 native **BLOCKED** (no ADB) — outdated vs 4C/5G. UI-1 proposes reducing Live chrome; 4C accepted populated Live discovery |

### Takes / discussions / replies

| | |
|---|---|
| Routes | `app/take/[takeId].tsx`, `app/(tabs)/create.tsx` |
| Components | `TakeEditorialHeader`, `CommentBranch`, `RebuttalInput`, `TakeComposerFields`, `theme/arena.ts` |
| Implemented | Yes — editorial discussion (design-system v1) |
| Device-tested | 4D.3 author nav + later 4D.3B reactions/replies PASS (report). Create keyboard **unverified 28 Oct** |
| This pack | Reports 4D; tracked design-system Take PNGs; demo `dark-take.png` |
| Incomplete | Create still uses `AuroraBackground`; media admission deferred |

### Groups

| | |
|---|---|
| Routes | Home mode `community`; `/arena/crews`, `/arena/crews/[slug]`, `/arena/crews/create` |
| Components | `GroupDiscovery`, `GroupCard`, `GroupButton` |
| Implemented | Discover/detail/leave. **Create/join admission deferred** (`withReleaseAdmission` on create; `releaseAllows` on join) |
| Device-tested | 4H.1 A50 discovery → detail → Back PASS (no unauthorized join) |
| This pack | 4H `REPORT.md`, `PHASE_4H2.md`. No 4H PNG in repo (screenshots.json only — **images missing**) |
| Incomplete | Nested IA; create CTA leads to beta unavailable |

### Explore / Discover

| | |
|---|---|
| Routes | `app/(tabs)/explore.tsx`, `/explore/country/[code]` |
| Components | Mosaic, `ExploreModeRail`, `ExploreFilterWheel`, `WorldExperience` |
| Implemented | For You / World / Live / Play / Meet modes |
| Device-tested | 4C Explore For You + Live; 4E World country nav; 28 Oct Explore mosaic + IME overlap |
| This pack | `screenshots/04-explore-tab`, `10-vault` (filename is Explore, not Vault); `05`–`09` **excluded** (WhatsApp system banner / clipboard) |
| Bugs | Floating rail overlaps tiles; VIDI truncated; IME covers feed; duplicate Live vs Arena Live |

### Profile / Activity / Settings / nav

| | |
|---|---|
| Routes | `/(tabs)/profile`, `/(tabs)/notifications`, `/profile/[id]`, `/settings`, sidebar |
| Implemented | Yes (Phase 1 settings/products). Activity inbox implemented |
| Device-tested | 4C guest vs auth profile partial; **Activity/Profile not captured 28 Oct** (Back left the app) |
| Incomplete | Settings sparse; sidebar duplicates tabs |

### Vault

| | |
|---|---|
| Routes | `/(vault)`, `/vault/[creatorId]`, drop/collection/course |
| Implemented | Public read; compose/studio deferred |
| Device-tested | 4G.2 A50 free Drop → collection → reader PASS |
| This pack | 4G `REPORT.md`. PNGs not in folder (json manifests only) |
| Unverified 28 Oct | Vault realm home |

### World / Play

| | |
|---|---|
| World | `/world`, Explore World. 4E.1 country nav PASS; **missions map FAIL** without Google Maps API key on installed APK |
| Play | `PlayHomePanel`, `/explore/challenge/[id]`. 4F A50 populated discovery + authenticated join (historical). Join **now deferred** by freeze — report is pre-policy |
| Conflicting | 4F join PASS vs current `releaseScope.play` deferred. Prefer freeze + UI-1 |

### Meet (deferred)

| | |
|---|---|
| UI | `MeetHomePanel` wrapped in `withReleaseAdmission('meet')` |
| Device | E3.6.6 / E3.7.x typing & keyboard reports exist; **do not treat as re-enable** |
| This pack | Does not attach Meet session PNGs (avoid chat content). Tracked `explore-e372/screens` already in git |

---

## Reports in this publication (newly added files)

Untracked historical reports copied as-is:

| Path | Phase | Native? |
|---|---|---|
| `docs/evidence/ui-completion-audit/REPORT.md` | Audit | n/a |
| `docs/evidence/ui-completion-phase3/REPORT.md` | 3 | BLOCKED (no ADB) — outdated |
| `docs/evidence/ui-completion-phase3a/REPORT.md` | 3a | see report |
| `docs/evidence/ui-completion-phase3b/REPORT.md` | 3b | see report |
| `docs/evidence/ui-completion-phase3c/REPORT.md` | 3c | see report |
| `docs/evidence/ui-completion-phase4/REPORT.md` | 4 plan | |
| `docs/evidence/ui-completion-phase4b-runtime/REPORT.md` | 4B | runtime |
| `docs/evidence/ui-completion-phase4c-device/REPORT.md` | 4C | A50 PARTIAL then Crowd keyboard PASS |
| `docs/evidence/ui-completion-phase4c-device/CHECKPOINT_BEFORE_LOGIN.md` | 4C | checkpoint |
| `docs/evidence/ui-completion-phase4d-takes/REPORT.md` | 4D | Take / replies |
| `docs/evidence/ui-completion-phase4d-runtime/REPORT.md` | 4D | |
| `docs/evidence/ui-completion-phase4d-vault/REPORT.md` | 4D vault | |
| `docs/evidence/ui-completion-phase4e-world/REPORT.md` | 4E | World; map key FAIL |
| `docs/evidence/ui-completion-phase4g-vault/REPORT.md` | 4G | Vault reader PASS |
| `docs/evidence/ui-completion-phase4h-groups/REPORT.md` | 4H | Groups PASS |
| `docs/evidence/ui-completion-phase4h-groups/PHASE_4H2.md` | 4H.2 | |
| `docs/evidence/release-readiness/UI_CHANGE_MANIFEST.md` | 5A inventory | |
| `docs/evidence/release-readiness/PHASE_5A_REPORT.md` | 5A | |
| `docs/evidence/release-readiness/PHASE_5B_REPORT.md` | 5B | |
| `docs/evidence/release-readiness/PHASE_5G_REPORT.md` | 5G Arena native | |
| `docs/ARENA_ANDROID_3_2K_NATIVE_ASSISTS.md` | Arena assists | |
| `docs/ARENA_ANDROID_3_2L_NATIVE_MEDIA_RETRY.md` | Media retry | |
| `docs/ARENA_ANDROID_3_2M_BUNDLE_PREFLIGHT.md` | Bundle preflight | |
| UI-1 three docs in this folder | Proposed | Partial A50 28 Oct |

Already tracked at base (not re-copied): Phase 1–2 reports, 3d, 4e-missions-map, 4f-play `REPORT.md`.

---

## Screenshots in this publication (new)

**Included (app UI, fictional/demo QA only):**

- `docs/evidence/ui-completion/screenshots/01-resume.png` (+ preview jpg) — settled Clash result
- `02-after-back`, `03-home-tab`, `15-resume2` — Arena Live empty gateway
- `04-explore-tab`, `10-vault` — Explore mosaic (10 is misnamed; it is Explore)
- `docs/evidence/arena-live-v2/phone-review/*.png` — Live, challenge, stage, crowd, keyboard (demo + A50)

**Excluded (unsafe or non-app):**

- `05`–`09` UI-1 frames — Samsung IME plus **WhatsApp logout banner** / clipboard overlay
- `arena-ui-phase66` bulk PNG/XML/JS bundles — Metro/dev menu, duplicates, not reviewable
- `ui-completion-phase4a-*` infra (migrations, realtime sockets, ACL) — not UI
- JSON fixtures, UIAutomator XML, database ledgers, Meet chat dumps

---

## Known conflicts / outdated reports

1. **Phase 3 BLOCKED** vs later 4C/4F/4G/4H/5G A50 PASSes — prefer later.
2. **4F Play join PASS** vs **6F/6E releaseScope play deferred** — join is no longer a beta admission.
3. **UI-1 Live empty** vs **4C populated Live** — environment/content changed; chrome issues remain.
4. **communityVerdictCopy** in source vs **SPLIT DECISION** still visible 28 Oct on settled result.
5. **4H/4G screenshot JSON** without PNG files — device claims are textual unless PNGs are recovered.
6. **origin/arena-ui-review** lacks freeze commits until this review branch (or a later push of arena-ui-review).

---

## Outstanding UI (from UI-1; not done)

Home IA, result overlay/type, Explore rail/IME, font scaling bans, Vault/World/Play visual coherence, Profile/Activity unverified, Meet stays closed.

---

## Privacy

Selected files were scanned for `service_role`, PEM keys, JWTs. Screenshots inspected: demo/QA fictional identities (`QA Rowan`, `Alex Morgan`). WhatsApp/system frames omitted. Localhost QA URLs in reports are environment names, not credentials.
