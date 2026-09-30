# Sponsorship attribution foundation

Phase 10 Step 1 + Step 1.5 hardening. Backend only — no advertiser dashboard,
payouts, or payments.

## Data model

| Table | Role |
| --- | --- |
| `advertisers` | Business entity; `created_by_profile_id` is owner |
| `sponsor_campaigns` | Campaign under an advertiser (**single `currency`**, default `INR`) |
| `campaign_creators` | Creator assignment + commission config |
| `referral_links` | Opaque cryptographic token per creator/campaign |
| `referral_clicks` | Click visits (no IP / fingerprint / GPS) |
| `coupon_codes` | Canonicalized codes; unique while `ACTIVE` |
| `conversion_events` | Idempotent conversions (`advertiser_id` + `external_conversion_id`) |
| `conversion_attributions` | One authoritative attribution per conversion |
| `conversion_geo_buckets` | Coarse region only — **never** lat/lng |
| `creator_commission_ledger` | Pending commission foundation (no payouts) |

**Forbidden columns (enforced by schema + tests):** buyer identity, email, phone,
latitude, longitude, exact address, raw IP.

## Referral tokens

`sponsor_new_referral_token()` uses **`extensions.gen_random_bytes(24)`**
(pgcrypto) encoded as lowercase hex → **48 chars / 192 bits**.

- Opaque, unique, URL-safe
- **`service_role` only** — ordinary clients cannot generate tokens

## Attribution rules

Priority inside `record_sponsor_conversion`:

1. Atomically reserved **ACTIVE** coupon (capacity remaining) + active creator assignment → `COUPON`
2. Else valid **ACTIVE** referral token + active assignment → `REFERRAL`
3. Else → `UNATTRIBUTED` (no commission)

Eligibility for **new** clicks/conversions:

- Advertiser status must be **`ACTIVE`** (`DRAFT` / `PAUSED` / `SUSPENDED` reject)
- Campaign must be live (`ACTIVE` + window)

Existing reporting remains readable for the advertiser owner while paused.

## Concurrency-safe idempotency

`UNIQUE (advertiser_id, external_conversion_id)` stays.

Insert path:

```text
INSERT … ON CONFLICT (advertiser_id, external_conversion_id) DO NOTHING
→ conflict loser re-SELECTs and returns the same row
→ only the insert winner writes attribution / commission / geo / coupon reserve
```

Duplicate webhook deliveries do not fail with unique_violation and do not
duplicate side effects.

## Coupon reservation

Coupon attribution uses an **atomic**:

```sql
UPDATE coupon_codes
   SET redemption_count = redemption_count + 1
 WHERE … AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
 RETURNING …
```

`COUPON` attribution happens only if that update returns a row. Exhausted
coupons fall through to referral / unattributed. `redemption_count` never
exceeds `max_redemptions`.

## Coupon canonicalization

On **INSERT/UPDATE of `code`** (trigger `sponsor_coupon_canonicalize_trg`):

1. trim
2. remove all whitespace
3. uppercase

So `SAVE10`, `save10`, and ` SAVE 10 ` are the same active code.

## Single-currency campaigns

`sponsor_campaigns.currency` (`^[A-Z]{3}$`, default `INR`).

`record_sponsor_conversion` **rejects** conversions whose currency differs.
No FX. No multi-currency campaigns in this phase.

Ledger currency matches the validated conversion/campaign currency.

## Commission calculation

Server-only (`sponsor_calc_commission_minor`):

| Type | `commission_value` | Result |
| --- | --- | --- |
| `FIXED_PER_CONVERSION` | minor units | that amount |
| `PERCENTAGE` | basis points (`10000` = 100%) | `floor(gross_minor * value / 10000)` |
| `NONE` | `0` | `0` |

## Privacy / geo

- `sponsor_min_geo_aggregate_count()` = **5**
- `advertiser_campaign_geo_summary` returns only buckets with `count >= 5`
- World GPS is a separate trust boundary — never used for sponsorship geo

## RLS (summary)

- Advertiser owner: read own advertiser/campaigns/assignments/links/codes
- Creator: read own assignments, links, codes, commission ledger
- **No** authenticated SELECT on `conversion_events`, `conversion_attributions`, `conversion_geo_buckets`, `referral_clicks`
- Aggregates only via RPCs

## Conversion ingestion trust boundary

`record_sponsor_conversion` / `record_referral_click` / `sponsor_new_referral_token`
→ **`service_role` only**.

Production path: merchant webhook / Edge Function with service role. Ordinary
app JWTs cannot ingest conversions or mint tokens.

## Client services

- `services/sponsorService.ts` — advertiser aggregates
- `services/creatorEarningsService.ts` — creator stats / ledger reads

No UI in this phase.

## Future payments

Ledger `PENDING` → `APPROVED` / `VOID` will later feed a payout provider.
That integration is intentionally deferred.
