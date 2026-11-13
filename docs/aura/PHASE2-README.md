# Project AURA — Phase 2

Branch `arena/ui-aura-phase2-20261113`, forked from Phase 1 at
`820f5df7d0c01c2acc21216f7d63f42c60723b5a`.

Phase 1 was reviewed at **6/10, integration blocked**. The finding was that it
produced useful visual foundations but not the requested end-to-end redesign.
That reading is correct, and this phase names the reason plainly:

> **Phase 1's typographic system never reached the app.** `typeRamp.ts` built
> `typeScale` from its own generic `family` object (`serif: 'serif'`), and
> `typography.ts` only overrode the family *after* re-exporting the already-frozen
> ramp. On iOS, `'serif'` is not a font name. So the "editorial voice" that the
> whole redesign rested on silently fell back to San Francisco at all 291 call
> sites. What a reviewer saw was, accurately, the existing screens with different
> colours.

That is blocker 7 of nine. It is fixed first here, because every other visual
judgement is meaningless until the type actually renders.

---

## Part A — the nine blockers, verified not assumed

Full evidence table: [`PHASE2-AUDIT.md`](./PHASE2-AUDIT.md).

Eight reproduced; one did not.

| # | Verdict | What was actually wrong |
|---|---|---|
| 1 | **Not reproducible as stated** | No `.easignore` exists, so EAS uploads the git tree, and all four modules were tracked. A real `expo export --platform android` was run and `strings` found `FIXED_FONT_BUDGET` and `Inter_700Bold` inside the shipped 12 MB `.hbc`, with a fabricated control string correctly absent. A guard was still added (`utils/auraPackaging.test.ts`) for the real failure mode: a file on disk that never reaches git. |
| 2 | Confirmed | Profile stat row had no `flexWrap`; a long reputation numeral at large text pushed the last stat off-screen. |
| 3 | Confirmed — **regression** | `Avatar` drew a raw `<Text>` inside a fixed circle with `overflow:'hidden'`. Phase 1 turned scaling *on*, so the initials grew and were sheared by the rim. |
| 4 | Confirmed | `LiveRoomHeader` animated `maxHeight` `140 → 0`. A fixed height by another name: title + meta + role chip already exceed 140dp at large text. |
| 5 | Confirmed | Two variants, `quiet` and `alert`, both failure kinds sharing one eyebrow: `SOMETHING WENT WRONG`. An offline device and a blocked profile read identically. |
| 6 | Confirmed | Realm switch `width: 40`, Create disc `34×34` — both under the 48dp minimum — and the docstring promised an active label that `renderTab` never drew. |
| 7 | Confirmed — **the root cause** | See above. |
| 8 | Confirmed, measured | `textMuted` `#71717A` measured 3.45–4.40:1 against the app's real surfaces (AA needs 4.5). Used for kickers, i.e. the smallest text. |
| 9 | Confirmed — **regression** | The mechanical prop removal left 108 whitespace-only lines. |

**Fixes.** Blocker 7 was fixed structurally, not patched: `typeRamp.ts` now exports
`buildTypeScale()` and `resolveFontStacks()`, and `typography.ts` builds the ramp
*from* the platform-resolved stacks. A late override is no longer expressible.
The old test had compared the ramp against the same frozen object it came from —
self-consistency that stayed green while the bug shipped — so it was replaced with
assertions on the real resolution path.

Blockers 3 and 5 followed the same principle: fix the model, then assert it.
`Avatar` keeps scaling on and caps the glyph at 1.6× with an explicit `lineHeight`;
the geometry lives in `avatarGeometry.ts` and a test sweeps eight sizes × ten scales
and fails if the glyph's line box would exceed 90% of the circle. `EmptyState`
gained `error` / `offline` / `denied` / `blocked`, and restrictions are deliberately
*not* painted in the danger colour — a blocked profile is a fact, not an alarm.

No accessibility setting was disabled and no assertion was weakened to get here.

---

## Part B — the Arena redesign

### The idea

Arena had grown by accretion. The room screen is ~1,100 lines and its vertical
order is whatever landed first, so a spectator opening a clash saw a header, a
pulse strip, a cast strip, a phase rail, a transcript and a composer at roughly
equal weight. Nothing on screen answered the four questions a participant has:
*what phase is this, what matters now, what may I do, what is the room doing?*

Phase 2 gives Arena one grammar, applied everywhere:

```
phase → subject → action → floor → result
```

That order is not a layout preference. It is a pure function of `(phase, role)`
in `utils/arenaHierarchy.ts`, which means it is testable, and it means "fighter
and spectator see different things" is a property of data rather than scattered
`if (isDebater)` in JSX.

### What is genuinely different

**The phase is stated in words.** Not a dot, not a coloured chip, not a run-on
meta line. `THE FLOOR IS YOURS` for a fighter, `THE FLOOR IS OPEN` for a
spectator — same phase, different instruction, because the phase means different
things to each.

**One permitted action, and no hole when there is none.** `ActionRegion` renders
the primary affordance and nothing else. A spectator in JUDGING who has already
voted sees no button rather than a disabled one. The region is driven by the same
`permittedAction()` the tests exercise.

**The floor has two lenses.** A fighter reads `OFFICIAL ARGUMENTS`; a spectator
reads `THE CROWD`. Same region, same position, entirely different content. This is
what makes the two experiences distinct while sharing one grammar — and it is a
field (`lens`) on the region plan, so it cannot drift.

**Arena's front door leads with the event.** Discovery previously opened with a
compact grey "live clashes" bar above a takes feed, framing CLASH as a social feed
with debates attached. `LiveClashFeature` gives a live clash the display voice
when one exists, and renders nothing when none does.

**The verdict is allowed to be large.** The result arrived as a banner inside the
transcript list at notice weight. It is now a headline in the platform serif, in
the winner's own colour, with the split as one bar (a 54/46 and a 90/10 are
different stories; a bare percentage hides that), and a DRAW is a first-class
outcome rather than "side A at 50%".

**Judging speaks the same language as everything else.** The panel alternated
between "Who made the better case?", "WHO COOKED?" and "Who cooked?" for one
question. It now asks once, in the editorial voice, and the ballot is presented as
a ballot.

Nothing in this list is a recolour. The information architecture changed; the
typography was merely the thing that had to work first.

### What was preserved

Backend permissions, the real-time lifecycle, navigation and settlement contracts
are untouched. No service, hook, route or RPC changed. The redesign mounts the same
data the screens already fetched; `LiveClashFeature` is a doorway to the real room,
not a player. `docs/aura/AUDIT.md` and the Phase 1 constraint map in
`utils/aura*Accessibility.test.ts` still hold.

Two source-reading tests needed updating because the component names changed, and
both were strengthened rather than relaxed: the home ordering test now also asserts
the old compact gateway is *gone*, and the dock test asserts the height is *derived*
rather than a literal that can drift.

---

## Part C — evidence, and what it is not

**There are no runtime screenshots.** This environment has no Android emulator and
no headless browser; browser CDNs return `000`. Phase 1 said this and it is still
true. Nothing below was captured from a device.

Three distinct kinds of evidence are therefore kept apart:

**1. Executed component checks — `scripts/aura/run-render-check.sh`, 35/35 pass.**
Real components mounted through `react-dom/server` and asserted on their output:
that `ClashHeader` states the phase in words, that the fighter and spectator action
labels differ, that a settled room reserves no action hole, that a draw is its own
outcome. This executes logic; it does not verify layout, because React DOM drops
RN-only props and cannot flatten RN style arrays. The probe says so in its own
header.

**2. Design previews — `docs/aura/preview/`, 21 PNGs.**
Pixel compositions drawn from tokens *read out of the repository at render time*,
so a token change changes the image. Every one carries a permanent
`NOT A SCREENSHOT` rule in its header. They are faithful to structure and copy, not
a layout guarantee.

**3. Before/after — `before-after.png`.**
The "before" tiles are Phase 1's committed PNGs pulled out of git at `820f5df7`,
not re-drawn. Phase 1's verdict preview is included *because it invented a 2—1
scoreboard and a settlement ledger the app never rendered*; showing it is the
honest way to demonstrate that the gap between preview and product has closed.

### The gallery

| File | Shows |
|---|---|
| `clash-debater-open-{dark,light}` | Fighter, open floor: phase headline, proposition, sides, `Make your argument`, official transcript |
| `clash-spectator-open-{dark,light}` | Spectator, same phase: `THE FLOOR IS OPEN`, `Pick a side`, **the crowd** |
| `clash-debater-judging-{dark,light}` | Judging: the ballot, not the transcript |
| `clash-spectator-settled-{dark,light}` | Settled: verdict, split, reward, best argument |
| `clash-*-large-text` (4) | The same rooms at ~160% text |
| `arena-verdict-{dark,light}` | The verdict card in the component's real layout |
| `vault-home-{dark,light}`, `profile-{dark,light}` | Vault and profile, for continuity |
| `gallery-{dark,light}` | Contact sheet |
| `design-system.png` | Type ramp, semantic tokens, surfaces, both schemes |

The large-text previews caught two real bugs on the way: my first version drew
fixed-width side tags and fixed-height argument cards, which collided and clipped
at 1.6×. Those were faults in the *renderer*, not the app — `ClashHeader` wraps that
row and the rows grow — so the drawing was made content-driven rather than the
component being changed to match a picture.

---

## Results

| Gate | Phase 1 | Phase 2 |
|---|---|---|
| `tsc --noEmit` | 0 errors | **0 errors** |
| `test:unit` | 820 pass | **864 pass, 0 fail** |
| `npm test` | exit 0 | **exit 0** |
| `run-render-check.sh` | 14/14 | **35/35** |
| `expo export --platform android` | not run | **builds, 12 MB `.hbc`, new components confirmed inside** |

New tests: `auraContrast` (six AA assertions over every text token × every surface,
both schemes, with alpha compositing), `auraAvatar` (geometry sweep), `auraEmptyState`
(semantic distinctness), `auraDock` (touch targets), `auraHygiene` (whitespace),
`auraPackaging` (tracking + ignore files), `arenaHierarchy` (the region grammar).

Each was written to fail on the Phase 1 state before the fix went in — the contrast
test was verified to fail on `#71717A` and pass on the new token.

---

## Known defects and remaining risks

Stated plainly, because a review that finds these itself will trust the rest less.

1. **No runtime verification of layout.** Nothing here proves the room screen does
   not overflow on a real A50 at 200% text. The geometry and wrapping are reasoned
   and unit-tested; they are not observed. This is the single largest gap.
2. **The room screen is wired, but the duel path is not.** All four new regions are
   mounted: `ClashHeader` replaces the room header, `ActionRegion` sits above the
   composer, `VerdictRegion` heads the settled transcript, and `LiveClashFeature`
   replaces the compact gateway on discovery. The existing composer, join bar,
   judging panel and `LiveRoomResultReveal` are all still there and still own the
   actual behaviour — the new regions add hierarchy above them rather than
   replacing working controls, which is deliberate: a redesign that reimplements
   settlement UI is a redesign that can break settlement.
   What is **not** done is `DuelRoomExperience` (item 3), the separate immersive
   duel surface.
3. **`DuelRoomExperience` (the canonical duel path) was not redesigned.** It is a
   separate ~1,000-line immersive surface with its own contracts. It inherits the
   token and type fixes but keeps its own layout.
4. **`LiveRoomHeader` is now unused** by the room screen but still exists; the duel
   path may still reference it. Dead-code removal was deferred rather than risk a
   contract break at review time.
5. **Preview renderer is a drawing, not a layout engine.** Pillow's line breaking
   is not Yoga's. Previews show structural intent and text pressure; they cannot
   certify spacing.
6. **Contrast is asserted for tokens, not for every composed pair.** A `textMuted`
   label placed on `brandSoft` is not covered; the contract covers text-on-surface
   pairs only.

## Merge blockers

- **Item 1: no runtime layout verification.** The regions are mounted and the type
  system is proven to resolve, but nothing here demonstrates that the assembled
  room screen holds up at 200% text on a real narrow device. Phase 1 was blocked
  for presenting unverified work as done; the honest status of this item is
  "reasoned and unit-tested, not observed".
- **Item 3: `DuelRoomExperience` is untouched.** If the review considers the duel
  path part of "the canonical Arena experience", this is a genuine scope gap, not a
  deferral of polish.
- No device screenshot exists and none can be produced in this environment.
