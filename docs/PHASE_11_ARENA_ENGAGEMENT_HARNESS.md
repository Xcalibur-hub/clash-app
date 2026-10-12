# Phase 11 Step 2C — Arena engagement harness repair

## Root cause

`scripts/arena-engagement-check.cjs` gated Module mocks with:

```js
file.includes('/Clash/')
```

That works only when the checkout path contains `Clash` (e.g. `Desktop/Clash`). Short-path worktrees such as `C:\p11e` never match, so:

1. Store / theme / auth mocks were skipped
2. Real `store` → `theme/glass.ts` loaded
3. Stub `react-native` lacked `Platform`, so `Platform.OS` threw and the harness exited 1 before any assertion ran

This was a **path-gating / incomplete RN stub** failure, not a missing JSX loader (Babel TSX transform was already present).

## Fix

- Detect package ownership with `path.resolve(__dirname, '..')` (same pattern as `world-discovery-runtime-check.cjs`)
- Add `Platform` to the RN stub
- Broaden store / AuthProvider request matching
- Clear / `unref` `setInterval` from `ArenaClashes` so Node exits
- Preserve all original engagement assertions; add loading/empty/Clashes entry checks

## Commands

```bash
npm run test:arena-engagement
# alias:
npm run test:arena:engagement
```

Sister scripts (unchanged) cover questions / navigation / challenge inbox:

- `npm run test:questions`
- `npm run test:arena-navigation`
- `npm run test:challenge-inbox`
