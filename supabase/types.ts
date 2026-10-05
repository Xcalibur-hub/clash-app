/**
 * CLASH's vocabulary over the generated schema.
 *
 * `supabase/database.types.ts` is written by `npm run supabase:types`, which
 * replaces the whole file — so that file must never be hand-edited. Anything the
 * app wants on top of it lives here instead, so the two can never drift.
 *
 * The names below are the ones the codebase already uses (`DbHood`, `TableRow`,
 * …), so call sites keep working; only the import path moves.
 */

import type { Database } from './database.types';

/** PostgREST's JSON column type, re-exported so callers need one import. */
export type { Json } from './database.types';

type Schema = Database['public'];

/** Real hoods — `for-you` is a feed scope, not a row. */
export type DbHood = Schema['Enums']['hood_id'];

/** Permission tier on `profiles.role` (spec §30 moderation). */
export type ProfileRole = Schema['Enums']['profile_role'];

export type TakeStatus = Schema['Enums']['take_status'];

export type ReportTarget = Schema['Enums']['report_target'];
export type ReportReason = Schema['Enums']['report_reason'];
export type ReportStatus = Schema['Enums']['report_status'];
export type ModerationAction = Schema['Enums']['moderation_action'];
export type NotificationKind = Schema['Enums']['notification_kind'];

export type MediaStatus = Schema['Enums']['media_status'];
export type MediaVisibility = Schema['Enums']['media_visibility'];

export type ClashStatus = Schema['Enums']['clash_status'];
export type ClashSide = Schema['Enums']['clash_side'];
export type ClashMode = Schema['Enums']['clash_mode'];
/** A settled winner: side A, side B, or an explicit DRAW (never overloaded onto A/B). */
export type VerdictWinner = Schema['Enums']['verdict_winner'];
export type ReputationKind = Schema['Enums']['reputation_kind'];
export type ClashRow = Schema['Tables']['clashes']['Row'];
export type JudgementRow = Schema['Tables']['judgements']['Row'];
export type VerdictRow = Schema['Tables']['verdicts']['Row'];
export type ReputationEventRow = Schema['Tables']['reputation_events']['Row'];

export type ProfileRow = Schema['Tables']['profiles']['Row'];
export type TakeRow = Schema['Tables']['takes']['Row'];
export type CommentRow = Schema['Tables']['comments']['Row'];
export type CommentUpvoteRow = Schema['Tables']['comment_upvotes']['Row'];

// ── Vault vocabulary (Phase 3 Step 1) ───────────────────────────────────────
export type VaultStatus = Schema['Enums']['vault_status'];
export type VaultDropAccess = Schema['Enums']['vault_drop_access'];
export type VaultDropStatus = Schema['Enums']['vault_drop_status'];
export type VaultSubscriptionStatus = Schema['Enums']['vault_subscription_status'];
export type VaultSubscriptionSource = Schema['Enums']['vault_subscription_source'];

export type CreatorVaultRow = Schema['Tables']['creator_vaults']['Row'];
export type VaultDropRow = Schema['Tables']['vault_drops']['Row'];
export type VaultCollectionRow = Schema['Tables']['vault_collections']['Row'];
export type VaultCollectionItemRow = Schema['Tables']['vault_collection_items']['Row'];
export type VaultSubscriptionRow = Schema['Tables']['vault_subscriptions']['Row'];

// ── Creator Communities vocabulary (Phase 15.2) ─────────────────────────────
export type VaultCommunityAccess = Schema['Enums']['vault_community_access'];
export type VaultCommunityStatus = Schema['Enums']['vault_community_status'];
export type VaultCommunityPostType = Schema['Enums']['vault_community_post_type'];
export type VaultCommunityContentStatus = Schema['Enums']['vault_community_content_status'];

export type VaultCommunityRow = Schema['Tables']['vault_communities']['Row'];
export type VaultCommunityMembershipRow = Schema['Tables']['vault_community_memberships']['Row'];
export type VaultCommunityPostRow = Schema['Tables']['vault_community_posts']['Row'];
export type VaultCommunityReplyRow = Schema['Tables']['vault_community_replies']['Row'];

export type TakeStance = Schema['Enums']['take_stance'];
export type TakeStanceRow = Schema['Tables']['take_stances']['Row'];

export type HoodGameType = Schema['Enums']['hood_game_type'];
export type HoodGameStatus = Schema['Enums']['hood_game_status'];
export type HoodGameRow = Schema['Tables']['hood_games']['Row'];
export type HoodGameOptionRow = Schema['Tables']['hood_game_options']['Row'];
export type HoodGameEntryRow = Schema['Tables']['hood_game_entries']['Row'];

export type WorldMissionStatus = Schema['Enums']['world_mission_status'];
export type WorldDropStatus = Schema['Enums']['world_drop_status'];
export type WorldMissionRow = Schema['Tables']['world_missions']['Row'];
export type WorldDropRow = Schema['Tables']['world_drops']['Row'];

// ── Creator World Drops vocabulary (Phase 15.3) ─────────────────────────────
export type WorldDropType = Schema['Enums']['world_drop_type'];
export type WorldDropReward = Schema['Enums']['world_drop_reward'];
export type WorldDropClaimRow = Schema['Tables']['world_drop_claims']['Row'];

// ── Interactive Creator Live vocabulary (Phase 15.4) ────────────────────────
export type CreatorLiveStatus = Schema['Enums']['creator_live_status'];
export type CreatorLiveAccess = Schema['Enums']['creator_live_access'];
export type CreatorLiveInteractionType = Schema['Enums']['creator_live_interaction_type'];
export type CreatorLiveInteractionStatus = Schema['Enums']['creator_live_interaction_status'];
/** The closed set of identifiers a crowd/game action may ever emit. */
export type CreatorLiveActionKind = Schema['Enums']['creator_live_action_kind'];
export type CreatorLiveSessionRow = Schema['Tables']['creator_live_sessions']['Row'];
export type CreatorLiveInteractionRow = Schema['Tables']['creator_live_interactions']['Row'];

// ── Sponsor attribution vocabulary (Phase 10 Step 1) ────────────────────────
export type AdvertiserStatus = Schema['Enums']['advertiser_status'];
export type SponsorCampaignStatus = Schema['Enums']['sponsor_campaign_status'];
export type SponsorCampaignType = Schema['Enums']['sponsor_campaign_type'];
export type CommissionType = Schema['Enums']['commission_type'];
export type AttributionMethod = Schema['Enums']['attribution_method'];
export type SponsorConversionType = Schema['Enums']['sponsor_conversion_type'];
export type CommissionLedgerStatus = Schema['Enums']['commission_ledger_status'];

export type AdvertiserRow = Schema['Tables']['advertisers']['Row'];
export type SponsorCampaignRow = Schema['Tables']['sponsor_campaigns']['Row'];
export type CampaignCreatorRow = Schema['Tables']['campaign_creators']['Row'];
export type ReferralLinkRow = Schema['Tables']['referral_links']['Row'];
export type ConversionEventRow = Schema['Tables']['conversion_events']['Row'];
export type CreatorCommissionLedgerRow = Schema['Tables']['creator_commission_ledger']['Row'];

/** What a select returns for a table, keyed by table name. */
export type TableRow<K extends keyof Schema['Tables']> = Schema['Tables'][K]['Row'];

/** What an insert may carry for a table, keyed by table name. */
export type TableInsert<K extends keyof Schema['Tables']> = Schema['Tables'][K]['Insert'];

/** What an update may carry for a table, keyed by table name. */
export type TableUpdate<K extends keyof Schema['Tables']> = Schema['Tables'][K]['Update'];
