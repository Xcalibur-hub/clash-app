# Product analytics (beta)

Privacy-safe product analytics for the external beta. Crashes stay in **Sentry**;
behavior events stay in **PostHog** via `services/analytics.ts`.

## Provider

- Package: `posthog-react-native`
- Abstraction: `analytics.track` / `identify` / `reset` / `setEnabled`
- Screens must not import PostHog directly

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Project API key (required to send) |
| `EXPO_PUBLIC_POSTHOG_HOST` | Host, e.g. `https://us.i.posthog.com` or EU host |
| `EXPO_PUBLIC_ANALYTICS_DEBUG` | Set `1` to force-enable in development |

Missing key → app runs normally; analytics no-ops.

Reporting defaults to **preview** and **production** release builds only.
Local Metro stays quiet unless `EXPO_PUBLIC_ANALYTICS_DEBUG=1`.

## Event taxonomy

| Event | When |
| --- | --- |
| `onboarding_completed` | After `markOnboarded` |
| `auth_completed` | After successful OTP verify |
| `arena_viewed` | Arena tab focus |
| `take_opened` | Take detail loaded once per take id |
| `take_created` | After successful `postTake` |
| `hood_joined` | After successful `joinHood` |
| `clash_started` | After successful `startClash` (not P0005 resume) |
| `judgement_submitted` | After successful `submitJudgement` |
| `world_opened` | World map focus |
| `world_drop_opened` | World drop loaded once per id |
| `world_drop_created` | After successful `createWorldDrop` |
| `vault_opened` | Vault ready (creator home or public vault) |
| `vault_drop_opened` | Drop reader reached ready/locked |
| `vault_drop_created` | After successful create (+ optional publish) |
| `profile_viewed` | Profile loaded once per profile id |

Allowed properties only: `source`, `realm`, `hood_id`, `take_has_media`,
`media_type`, `clash_mode`, `is_creator`, `is_guest`, `is_self`,
`world_distance_band`, `vault_access_type`, `world_filter`, `accessible`.

## Privacy rules

Never send: Take/comment text, bios, search text, email, OTP, tokens, Supabase
keys, private Vault URLs/signed URLs, raw GPS, addresses, Mindshift stance,
DM contents, payment details.

World may send coarse `world_distance_band` only — never lat/lng.

## Identity

- Guests: PostHog anonymous id
- Authenticated: `identify(authUserId)` only (no email/name/handle)
- Sign-out: `analytics.reset()` via `AuthHydrator`

## Disable analytics

```ts
analytics.setEnabled(false);
```

No Settings UI in this pass. Also omit `EXPO_PUBLIC_POSTHOG_API_KEY`.

## Autocapture / session replay

- No `PostHogProvider` autocapture
- `enableSessionReplay: false`
- Explicit taxonomy events only
- App lifecycle events kept for retention (D1/D7/D30)

## Dev verification

1. Set `EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, and
   `EXPO_PUBLIC_ANALYTICS_DEBUG=1`
2. Restart Metro
3. Watch Metro logs for `[clash:analytics] <event> {…}`
4. Confirm events in the PostHog project live view
