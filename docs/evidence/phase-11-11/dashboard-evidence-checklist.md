# Dashboard evidence checklist — closes OPS-1, OPS-2, OPS-10 (operator action)

**Why:** no approved staging-scoped read-only Management API credential exists (see
`management-api-availability.json`). These pages replace it. **Redact every value** (keys, secrets,
tokens, addresses) — only the *state* of each setting is needed.

Supabase Dashboard → project **`zrutlrhhvfcsmssjiijl` (clash-staging)**.

## 1. Authentication → URL Configuration  (closes OPS-1)
- [ ] **Site URL** — record the value.
- [ ] **Redirect URLs** — full list (does it include the Expo/deep-link scheme(s) used by the app?).
- [ ] Are there any unexpected or overly broad wildcard entries?

## 2. Authentication → Providers / Settings  (closes OPS-1)
- [ ] Email provider enabled? Confirm-email required?
- [ ] Any third-party providers enabled (Google, Apple, …) — list.
- [ ] **Settings → Allow new users to sign up** (expected: enabled for staging testing).
- [ ] **Anonymous sign-ins** (expected: disabled).
- [ ] **JWT expiry** (expected: 3600 s) and refresh-token rotation state.
- [ ] SMTP/email provider status (custom SMTP vs built-in).

## 3. Edge Functions  (closes OPS-2)
- [ ] Full list of deployed function names. Expected set: `vault-media-access`,
      `course-lesson-media-access`, `creator-ai`, `digital-creator`, `arena-editorial`, `arena-gifs`.
- [ ] Any **extra** deployed function not in that list?
- [ ] Any **missing** expected function?
- [ ] Version/`updated_at` per function (to confirm the deployment is current).
- [ ] **Enforce JWT verification** state per function (expected ON for all except `arena-editorial`).
- [ ] Secrets page: list **names only** of function secrets (expected names include
      `TENOR_API_KEY`, `CREATOR_AI_API_KEY`, `DIGITAL_CREATOR_API_KEY`, `ARENA_EDITORIAL_RUN_SECRET`,
      `SUPABASE_SERVICE_ROLE_KEY` where the function requires it). **Never copy values.**

## 4. Project Settings → API  (closes part of task 4)
- [ ] **Exposed schemas** (expected: `public`, `graphql_public`).
- [ ] **Max rows** (expected 1000) and extra search path (`public`, `extensions`).
- [ ] PostgREST service status / any disabled-API toggle.

## 5. Realtime / Database → Publications  (closes part of task 5)
- [ ] `supabase_realtime` publication exists (already read-only verified) and the replicated table list
      (expected, from local parity: `arena_crowd_messages`, `arena_room_messages`,
      `creator_live_events`, `creator_live_interactions`, `creator_live_sessions`).
- [ ] Realtime enabled; any tenant/max-concurrency or channel-restriction settings.

## 6. Project Settings → General + Organization  (closes OPS-10)
- [ ] Region and plan/tier.
- [ ] Organization name — confirm it is **distinct** from the production project's organization.
- [ ] Confirm this project is **not** linked to production data, and that no production project shares
      its organization/ref prefix.

## 7. Storage (already read-only verified — optional cross-check)
- [ ] Buckets page shows exactly `public-media` (public) and `private-media` (private); no extras.

## Handling
Return the completed list (or redacted screenshots) as an evidence attachment. Nothing in this
checklist requires a credential, a write, a deployment, or any hosted change.
