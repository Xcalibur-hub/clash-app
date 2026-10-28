# Phase 3.2K — Native canonical duel and private assists

2026-10-15, Samsung SM-A505F, existing `com.clash.v2.dev` build. Tested local revision **`ab4843072fc0717b6d42c70b557607bb306e1113`**, branch `feat/arena-v2-editorial-ui`.

**Navigation gate: PASS. Minimum native text-assist lifecycle: PASS. Complete ten-scenario verification: PARTIAL; native media and retry cases remain unverified.** No application code, migrations, canonical clocks or integrity constraints changed.

## Isolated fixture and boundaries

Reused the reviewed Phase 3.2F scripts in a fresh owner-protected ignored directory, `.expo/arena32k-20261015`, with new project **`clash_p11bind_arena32k_20261015`** and fresh disposable secrets/accounts. Preflight checked unused ports 57721/57722/8083 and absence of the new resource names. Rendered Compose and actual created-container HostConfig bindings permitted only `127.0.0.1` for DB/gateway; PostgreSQL's Windows listener was also `127.0.0.1:57722`.

Managed initialization succeeded; **104/104 migrations applied**, in reviewed filename order, to the new database. Historical sources were not edited. The reused artifact performs the reviewed exact-match redundant pgcrypto compatibility assertion. Real Deno Edge Runtime image: `public.ecr.aws/supabase/edge-runtime@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8`; production assist handler copied into the private harness, internal gateway `http://kong:8000`, no published Edge port. Unauthenticated function invocation returned 401.

Three isolated accounts were created. Authenticated A created a Take, B challenged, and A accepted through the actual product RPCs. One canonical Clash **`cl_b77963fe489ed9c3`**, one linked DUEL Room **`ar_788413ff115f4c5e`**, exactly two official fighters, all independently asserted. [Server gate evidence](evidence/arena32k/state-gate-a.json).

Original server times: opens `2026-10-15T12:18:39.089637Z`, closes `2026-10-15T12:48:39.089637Z` (17:48:39–18:18:39 IST). The official argument/assist window ended before overall Clash close. **No UPDATE of clocks, fixture reopening, extra duel or deadline bypass.**

The shared stack and hosted Supabase were not queried, migrated or reset. No app-data clearing, native rebuild, permission change or personal media selection. Existing untracked `Microsoft/`, `expo/`, `shot.png`, `sybil.html`, `sybil/` preserved.

## Development diagnostics and accessibility

Isolated Metro 8083 used `EXPO_NO_DOTENV=1`, a clean child environment, the disposable loopback backend, and both requested development flags set to `1`. Existing code gates them with `__DEV__`; focused tests verified default-off and production-off behavior.

The private driver removed only its own XML before each dump, required a newly returned hierarchy, and allowed at most **three attempts, 15 seconds each**. Taps and scrolls used bounds from the current accessibility tree. No Room deep-link intent, stale XML or guessed coordinates was used to satisfy the navigation gate. The Room tree was obtainable with the motion freeze, so owner-assisted fallback was not required.

## Fighter A: six navigation-gate checks

The requested Take-detail label **“Enter your room” does not exist at this revision**. Its accepted challenge exposes **OPEN DUEL**. The tested path was source Take detail → actual OPEN DUEL press; topic cards were not substituted.

| Check | Result | Evidence |
|---|---|---|
| 1. Actual press handler executes | PASS | Fresh tree contained the accepted challenge's enabled OPEN DUEL button. Native press was followed by the expected Room mount and loaded content. Its inspected handler calls `router.push` with that accepted challenge's linked ID. There is no separate Take-button press-log event at this revision; the actual transition establishes execution. |
| 2. Destination contains expected Room ID | PASS | `room-mounted` reported `ar_788413ff115f4c5e`, matching the accepted server link; subsequent loaded-state diagnostic reported the same ID. |
| 3. Room component mounts | PASS | Actual `[clash:nav] room-mounted` event with `mounted:true`. |
| 4. App requests get_arena_room for that Room | PASS | Gateway recorded phone `okhttp/4.12.0` POSTs to `/rest/v1/rpc/get_arena_room`. The hook binds the mounted route ID to `fetchRoom(roomId)` and its RPC `p_room_id`; the parsed loaded Room reported that same ID. Raw HTTP request bodies were not captured. |
| 5. Request succeeds with correct viewer | PASS | Phone requests returned **HTTP 200**. Native Stage showed Fighter A and `@user_e50232`; native Profile independently showed that actor. Caller-bound API verification matched A's authenticated user/profile, `fighter_a` relationship and fighter-A ID. |
| 6. Real Live content is in accessibility tree | PASS | Fresh tree contained the unique Take title, LIVE, both fighter handles, Fighter A role, official composer, private inbox and Crowd. [App-only tree projection](evidence/arena32k/room-a.json). |

[Navigation events](evidence/arena32k/navigation.log), [actual gateway HTTP evidence](evidence/arena32k/room-rpc.log). Important diagnostic detail: the existing event named `room-request` fires **after a parsed Room is installed in state**, not before the network request; gateway evidence independently establishes the real HTTP request/result. The `node` request in the gateway log is the fixture's API probe and is not counted as native evidence.

## Other roles

- **Fighter B: PASS.** Native sign-out/sign-in, same Take → OPEN DUEL; fresh tree showed `YOU'RE FIGHTING · FIGHTER B` and the official composer. [B tree](evidence/arena32k/room-b.json).
- **Spectator C: PASS.** Inspected `/clash/[takeId]` canonical redirect first. Native source Take → **Clash on this take** → linked Room → **Watch this Clash as a spectator**. No API shortcut granted membership. Fresh tree showed WATCHING, genuine `1 joined`, and no official composer. [Entry gate](evidence/arena32k/spectator-entry.json), [joined state](evidence/arena32k/spectator-room.json).
- **Server authorization: PASS for executed negative probe.** C's actual `submit_arena_official` RPC after joining returned **42501**. Native absence of a composer alone was not treated as authorization proof.

## Ten private-assist scenarios

This breakdown separates each requested interaction and its native versus API evidence. GIF remains a separate explicit blocker.

| # | Scenario | Native result | API/DB evidence and limits |
|---|---|---|---|
| 1 | C chooses A and sends private text | PASS | Native fighter selector, text entry and Send privately. One PENDING row in A inbox; B inbox empty; official count 0. [After send](evidence/arena32k/state-text-sent.json). |
| 2 | A receives and sees that assist | PASS | Native inbox displayed the exact submitted body and PENDING status. [Inbox tree](evidence/arena32k/inbox-a.json). |
| 3 | A accepts; content stays unpublished | PASS | Native row-specific Accept; ACCEPTED with null publication link, official count still **0**. [After accept](evidence/arena32k/state-after-accept.json). |
| 4 | A explicitly publishes; official argument appears once | PASS | Native row-specific Publish as my argument. Exactly one official row, linked from the accepted assist; native Argument history displayed the exact body **once**, attributed to Side A. [Server result](evidence/arena32k/state-after-publish.json), [native history](evidence/arena32k/published-history.json). |
| 5 | Lost-response retry / duplicate publication | NOT TESTED natively | No transport-failure injection or same-key RPC retry executed in this run. A single successful publication/count of one is not proof of retry correctness. Focused client tests covered mocked lost-response persistence only. |
| 6 | Reject a second assist; never publish it | PASS | C natively sent a second text; A used that row's Reject. REJECTED, null publication link; total official count stays **1**. [After reject](evidence/arena32k/state-after-reject.json). |
| 7 | Selected recipient isolation | PARTIAL | A natively read/responded; B's Room was physically verified before assists existed. B's caller-bound inbox later returned zero, and direct known-ID SELECT by B and C returned zero rows. B's post-send empty inbox was not verified physically. |
| 8 | Native private image picker/upload/view | BLOCKED | The unchanged official/assist submission window expired before this scenario. No photo was selected, uploaded or viewed in this run; no media fixture was placed on the phone. |
| 9 | Native private video picker/upload/playback | BLOCKED | Same deadline prerequisite. No native video processing/playback claim. |
| 10 | Signer access and unauthorized private fetch | PARTIAL | Real Deno: anonymous request **401**, B's known text-assist request **403**. Anonymous direct table SELECT **42501**; B/C known-ID reads zero rows. There was **no valid-media positive control**, so this does not prove selected-fighter media delivery or native attachment rendering. [Security results](evidence/arena32k/security-results.json). |

**GIF: BLOCKED.** Not intentionally enabled/configured or tested. No additional fixture or clock change was used to turn the remaining cases into passes.

## Commands and actual test results

- Private reviewed harness: `prepare.cjs`, `prepare-edge.cjs`, `lifecycle.cjs create|db|bootstrap`, `migrate.cjs`, `lifecycle.cjs runtime`, `edge-start.cjs`, `accounts.cjs`, `native-room.cjs` — executed sequentially against this new project only; **104 migrations, exit 0**. [Migration result](evidence/arena32k/migration-result.json).
- Native driver commands actually used: `dump`, `tapDesc`, `scroll`, `login`, `fill`, assist `row` actions and `shot`. Private credentials entered through ADB stdin, never command arguments or logs. Initial links opened only Auth, Profile or source Take, never a Room.
- `node --experimental-strip-types --test utils/navDiagnostics.test.ts utils/decorativeMotion.test.ts` — **9 tests, 2 suites, 9 passed, zero failures/skips**, exit 0.
- `node scripts/assist-service-check.cjs` — **10/10**, exit 0, controlled transport/storage. Includes lost-response request-key persistence and account isolation; not native retry evidence.
- `node scripts/assist-signer-check.cjs` — **14/14**, exit 0, mocked upstreams; separate from actual Deno denial requests.
- Fixture-state helper asserted one canonical Clash/Room, two correct fighters, A identity and official counts at each step. Security helper's five checks passed. These are API checks, not pgTAP totals.

No full unit suite, TypeScript, Expo Doctor or pgTAP suite was rerun: no tracked application code changed, and this checkpoint requested focused native verification. Historical results are not presented as new passes.

## Failures and tooling limits

An initial 15-second device preference operation and screenshot timed out. Saved original preferences were retained; a bounded shell probe succeeded, and sequential 30-second operations completed and verified the isolated host. No ADB restart, app-data wipe or device-security bypass.

The first auth driver found both a button and its text child; it refused the ambiguous target before submission and was narrowed to the clickable control. A profile-menu tap initially did not expose Sign out; the following login driver rejected the non-auth screen. Inspection and a fresh settled-target press recovered the switch. Android flattened assist row wrappers; an ambiguous row action was rejected, then scoped by the exact body and its following Report and hide boundary in the fresh tree. PowerShell redirected JSON as UTF-16; an initial evidence parser failed and was corrected. These are recorded harness failures, not passing product tests or established app defects.

Sanitized generic Supabase warnings occurred alongside successful Room loading; they were not treated as Room rejection. Backup capacity telemetry was also not treated as seating denial. No confirmed application defect was changed in this checkpoint.

## Cleanup and remaining work

- Original native development preferences restored **byte-for-byte**; host `localhost:8081`. No app-data clear or permissions change. Task UI XML and temporary preference-transfer file removed.
- ADB reverses **8081/55321 restored**, **8083/57721 removed**.
- Isolated diagnostic Metro process tree identity-checked and stopped. **Normal Metro 8081 running**, backend validated against the existing loopback 55321 configuration; diagnostic flags disabled. No environment file edited. The app was closed after restoration; returning to the owner's account may require normal sign-in.
- Ten verified disposable containers and their owned volumes/network removed. Pre-existing Docker inventories exactly matched baseline. Explicit project-scoped checks show **0 containers / 0 volumes / 0 networks** remaining. [Device restoration](evidence/arena32k/device-cleanup.json), [final cleanup](evidence/arena32k/final-cleanup.json).

Next native session needs a fresh separately identified duel with its normal unmodified submission window, prioritizing image/video and lost-response retry scenarios immediately after entry. Do not reopen this fixture or equate this report with complete media or production-readiness validation.

PR #65 was verified **OPEN, DRAFT, unmerged**. Its remote head had independently advanced to `4f0aef0a19e6c97a5143330c0dfe328f5f1728d9` during this task; that revision is not covered by this verification. No pull, overwrite, merge or deployment was performed. Report/evidence are local; no new application commit or push was made.
