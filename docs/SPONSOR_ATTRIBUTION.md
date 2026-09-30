# Sponsorship attribution foundation

Phase 10 Step 1 — backend only. No advertiser dashboard, payouts, or payments.

## Data model

| Table | Role |
| --- | --- |
| `advertisers` | Business entity; `created_by_profile_id` is owner |
| `sponsor_campaigns` | Campaign under an advertiser |
| `campaign_creators` | Creator assignment + commission config |
| `referral_links` | Opaque token per creator/campaign |
| `referral_clicks` | Click visits (no IP / fingerprint / GPS) |
| `coupon_codes` | Normalized codes; unique while `ACTIVE` |
| `conversion_events` | Idempotent conversions (`advertiser_id` + `external_conversion_id`) |
| `conversion_attributions` | One authoritative attribution per conversion |
| `conversion_geo_buckets` | Coarse region only — **never** lat/lng |
| `creator_commission_ledger` | Pending commission foundation (no payouts) |

**Forbidden columns (enforced by schema + tests):** buyer identity, email, phone,
latitude, longitude, exact address, raw IP.

## Attribution rules

Priority inside `record_sponsor_conversion`:

1. Valid **ACTIVE** coupon for that campaign (not expired / under max redemptions) + active creator assignment → `COUPON`
2. Else valid **ACTIVE** referral token for that campaign + active assignment → `REFERRAL`
3. Else → `UNATTRIBUTED` (no commission)

Paused / non-live campaigns reject ingestion.

## Commission calculation

Server-only (`sponsor_calc_commission_minor`):

| Type | `commission_value` | Result |
| --- | --- | --- |
| `FIXED_PER_CONVERSION` | minor units | that amount |
| `PERCENTAGE` | basis points (`10000` = 100%) | `floor(gross_minor * value / 10000)` |
| `NONE` | `0` | `0` |

Ledger status starts at `PENDING`. Clients cannot mutate amounts.

## Privacy / geo

- `sponsor_min_geo_aggregate_count()` = **5**
- `advertiser_campaign_geo_summary` returns only buckets with `count >= 5`
- Smaller buckets are omitted (not shown as individual rows)
- World GPS is a separate trust boundary — never used for sponsorship geo

## RLS (summary)

- Advertiser owner: read own advertiser/campaigns/assignments/links/codes
- Creator: read own assignments, links, codes, commission ledger
- **No** authenticated SELECT on `conversion_events`, `conversion_attributions`, `conversion_geo_buckets`, `referral_clicks`
- Aggregates only via RPCs

## Conversion ingestion trust boundary

`record_sponsor_conversion` / `record_referral_click` → **`service_role` only**.

Production path:

1. Merchant webhook or trusted Edge Function verifies the event
2. Calls RPC with service role
3. Passes only referral token / coupon / coarse geo labels — never buyer PII

Ordinary app JWTs cannot ingest conversions.

## Client services

- `services/sponsorService.ts` — advertiser aggregates
- `services/creatorEarningsService.ts` — creator stats / ledger reads

No UI in this phase.

## Future payments

Ledger `PENDING` → `APPROVED` / `VOID` will later feed a payout provider
(Razorpay/UPI/etc.). That integration is intentionally deferred.
