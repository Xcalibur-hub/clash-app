# Physical Android recording: Arena route and discovery diagnosis

## Identified records

Local database inspection and authenticated PostgREST reads identified:

| Object | ID | Actual state |
| --- | --- | --- |
| Take | `crowd-local-db818d32` | Active retained runtime fixture |
| Pending challenge | `d2b17723-87a1-4356-a19b-d34184033ff6` | PENDING; no Clash or Room link |
| Earlier challenge | `e35e8f48-b5cc-4b26-bf79-0e6f0082c140` | CANCELLED; no Clash or Room link |
| Canonical Clash | `cl_b22e92269cf3ab99` | cancelled; no verdict |
| Canonical Room | `ar_3511812688853a0c` | CANCELLED; exactly two fighters |
| Copied topic | `at_b335d4c5877d23d6` | closed |

Both challenges belong to Local Dev against the disposable runtime-fixture
author. Neither challenge was accepted. The Clash was created separately by
the local Crowd runtime test; its Room link is confirmed by `clash_view_for_take`
and the underlying database. Its transcript has two genuine official rows;
six genuine Crowd rows remain stored. Cancelled Crowd access is denied by the
existing server policy, even to an existing spectator. No state was reopened.

## Root causes and changes

The Take and feed Clash actions use `/clash/<takeId>`. That screen fetched the
canonical payload but ignored `battleMode: DUEL` and `roomId`, rendering the
legacy judgement UI. Its argument list uses Take comments, so it showed no
arguments despite the Room transcript. It now redirects canonical payloads to
their linked Room. Historical Clashes without Rooms retain their original UI.
The legacy settlement effect does not run on canonical payloads.

`--keep-for-device` deliberately retained the runtime fixture. Its original
"removed after testing" text was a misleading promise, not a database status.
After verifying the saved fixture's author and canonical Room link, exactly
that Take was marked with the new server-controlled `is_runtime_fixture`
column. No Take, challenge, account, transcript or Crowd message was deleted,
and competitive states were not changed. New runtime fixtures set the flag
at creation and use accurate retained-for-verification text.

Ordinary feed queries filter that flag on the server. Topic discovery excludes
copied fixture propositions while direct canonical Room verification remains
possible under existing membership rules.

The Clashes screen previously used only currently live topics and hardcoded
"Nothing pending here." It now reads a bounded, caller-scoped discovery RPC:

- Pending: unexpired PENDING challenges visible through the caller's RLS;
  navigate to the Take, never a duel.
- Live: an open Clash within its server-clock opening/closing window.
- Upcoming: an open Clash whose opening time is still in the future.
- Completed: settled, cancelled, or elapsed Clashes; an elapsed record can
  remain un-settled and is not assigned an invented verdict.

Canonical cards navigate by Room ID. Legacy cards retain the Take-based Clash
route. Existing topic Room navigation is retained separately. Account changes
clear discovery data and invalidate stale responses. A cancelled Room does not
start a Crowd subscription and explains cancellation rather than offering an
endless connection retry.

## Executed validation ? final physical checkpoint, October 8

- Typecheck passed; unit suite 412/412 passed (including discovery tests).
- Crowd service checks: 7/7; component render scenarios: 19/19, including
  cancelled Crowd explanation and absence of a send action.
- Expo Doctor: 18/18 checks passed.
- Complete database suite: 65 files, 2,516 pgTAP assertions passed, zero failures.
  Docker/Supabase CLI commands remained unresponsive. Tests actually executed
  against explicit localhost:55322 using the existing supabase_admin role,
  transactional pgTAP/search_path setup and translation of four existing psql
  gset commands. This is not a claim that the Supabase CLI test command passed.
  Existing concurrency/security suites and uncommitted Crew tests were included.
- Initial full-suite failures identified runner incompatibilities and global
  reward/notification counts in test 002. Runner corrections and counts scoped
  to that test's own Clash resolved them; the complete suite was rerun successfully.
- Read-only Arena load harness: all three profiles executed, 260 requests,
  zero errors. Pulse/reconnect are trending-read proxies, not live delivery
  verification; snapshot writer timing was intentionally skipped.
- Authenticated REST/RPC reads verified fixture exclusion, retained member Room
  access, two official transcript rows, cancelled-Crowd denial, and anonymous
  denial of the new discovery RPC.
- Local migration 20261008121000 ledger text equals the migration file exactly.
  No hosted migration, database reset, deletion of legitimate data, or competition
  reopening was performed. Test concurrency fixtures cleaned up successfully;
  original four Clashes and six retained Crowd rows remain.

## Physical Samsung A50 results

ADB device RZ8M30DE9NL was unlocked and connected. Reverse forwarding for 8081
and 55321 was active; Metro and local Supabase health endpoints responded.
The current repository development bundle was loaded through a full Metro
reload; an initial stale in-memory feed card disappeared after that reload.
Screenshots are retained locally under .expo/android-startup-check (not committed).

- Ordinary For You showed no retained runtime Take after reload.
- Clashes displayed three genuine settled legacy records under Completed;
  Pending, Live and Upcoming correctly showed empty states for discoverable data.
- Original Local Dev's direct Take displayed its actual Pending challenge with
  a Cancel action and no Open Duel action. Its challenge has no Clash/Room link.
- Tapping that Take's actual Clash button reached the linked cancelled Room's
  member-only gate rather than legacy Judgement. Local Dev is not a member.
- An existing spectator account reached the immersive CANCELLED Room via the
  canonical Clash route: exactly two fighters, latest official argument, and
  the two-row official history. Crowd explicitly explained cancellation and
  provided no Send/Retry controls; the cancelled path passes no Room to the
  Crowd subscription hook. No packet-capture claim is made.
- A genuine settled legacy Take retained its original Judgement route and verdict.
- Account switching was performed through the physical UI, and original
  Local Dev was restored and confirmed on its profile afterwards.

## Remaining limitations

No discoverable Pending, Live or Upcoming positive records existed. Their
positive state classification and pending destinations passed transactional
SQL/unit tests; positive physical cards were not fabricated. The retained
Pending fixture is intentionally excluded from ordinary discovery.

The cancelled Room provides historical Stage verification, not active Crowd
send/receive verification. Two-device live Crowd delivery was not retested:
there is no active canonical duel, and none was created or reopened.

Discovery is bounded to 60 records and refreshes every 20 seconds/on focus.
Generated schema refresh was blocked by the Docker CLI; the new RPC uses an
explicit additive type extension. Apply the additive migration before shipping
this client to hosted environments; no hosted migration was applied here.

The October 3 development APK still logs the pre-existing missing ExpoCamera
native-module mismatch. Arena navigation and historical Stage worked despite
that error; no native rebuild or unrelated camera change was attempted.
Pre-existing launch scripts and unrelated Crew modifications remain excluded
from this focused commit. Final commit/push SHA is provided in the completion
message.
