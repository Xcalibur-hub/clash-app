import type { GradientColors } from '../theme';

/** Hoods are CLASH's local/social communities (spec §14). */
export type HoodId =
  | 'for-you'
  | 'techtakes'
  | 'campushustle'
  | 'goatalk'
  | 'movies'
  | 'gaming'
  | 'startups'
  | 'football';

export interface Hood {
  id: Exclude<HoodId, 'for-you'>;
  name: string;
  tagline: string;
  members: number;
  liveClashes: number;
}

/** The two product realms (spec §1, §16): the 24h Arena vs the premium Vault. */
export type Realm = 'arena' | 'vault';

/** Reputation ladder (spec §11). */
export type RankName =
  | 'Rookie'
  | 'Instigator'
  | 'Hot Take'
  | 'Firestarter'
  | 'Provocateur'
  | 'Clash King'
  | 'Legend';

export type BadgeTier = 'streak' | 'fame' | 'early' | 'jury';

export interface Badge {
  id: string;
  label: string;
  tier: BadgeTier;
}

export interface User {
  id: string;
  /** Stored without the leading '@'. */
  handle: string;
  name: string;
  /** One of `accent` — drives the avatar gradient. */
  tint: string;
  hood: HoodId;
  rank: RankName;
  reputation: number;
  coins: number;
  clashes: number;
  wins: number;
  streak: number;
  badges: readonly Badge[];
}

export type MediaKind = 'image' | 'video';

/** Mock media: a gradient plate + caption stands in for a real asset. */
export interface TakeMedia {
  kind: MediaKind;
  caption: string;
  colors: GradientColors;
  duration?: string;
}

/** A Take is the atomic Arena post and expires after 24 hours. */
export interface Take {
  id: string;
  authorId: string;
  text: string;
  hood: HoodId;
  createdAt: number;
  expiresAt: number;
  clashes: number;
  reactions: number;
  media?: TakeMedia;
}

/** The two duelling sides of a Clash. */
export type Side = 'A' | 'B';

/** A viewer's ballot: A, B, or abstain. */
export type Judgement = Side | 'UNDECIDED';

export interface Juror {
  id: string;
  handle: string;
  tint: string;
  vote: Side;
  /** Mock anti-abuse weighting (spec §9) — 1 = standard juror. */
  weight: number;
}

export interface JuryScore {
  a: number;
  b: number;
}

export interface Clash {
  id: string;
  takeId: string;
  challengerId: string;
  challengerText: string;
  createdAt: number;
  /** The randomly convened jury. The tally only exists once a ballot is filed. */
  jurors: readonly Juror[];
  engagement: number;
}

/** How the viewer's ballot compared to the 9-person jury. */
export type Alignment = 'majority' | 'minority' | 'abstained';

/** One line of the reputation ledger shown in the result reveal (spec §11). */
export interface XpEvent {
  id: string;
  label: string;
  delta: number;
}

// ── Vault domain (spec §17–§22) ───────────────────────────────

/** Premium creator selling drops inside the Vault. */
export interface Creator {
  id: string;
  handle: string;
  name: string;
  tint: string;
  tagline: string;
  reputation: number;
  followers: number;
  /** Share of followers in the creator's home city (0..100). */
  homeShare: number;
}

/** A Vault drop: public = free, exclusive = mock-unlock. */
export interface Drop {
  id: string;
  creatorId: string;
  title: string;
  blurb: string;
  tier: 'public' | 'exclusive';
  /** Mock INR price for exclusive drops. */
  price: number;
  unlocks: number;
  rating: number;
}

export type CampaignStatus = 'ACTIVE' | 'ENDED';

/** A sponsor campaign measured by mock attribution (spec §20). */
export interface Campaign {
  id: string;
  code: string;
  sponsor: string;
  sponsorTint: string;
  creatorId: string;
  status: CampaignStatus;
  clicks: number;
  redemptions: number;
  orders: number;
  /** Mock INR GMV in rupees (8.4L → 840_000). */
  gmv: number;
  /** City share of attributed orders; sums to ~100. */
  cities: readonly CityShare[];
  period: string;
}

/** One slice of the city distribution (spec §20 dataset). */
export interface CityShare {
  city: CityName;
  share: number;
}

export type CityName = 'Goa' | 'Mumbai' | 'Bangalore' | 'Delhi' | 'Other';

/** Mock checkout state for a single exclusive drop. */
export type UnlockStatus = 'locked' | 'paying' | 'unlocked';

export interface UnlockRecord {
  dropId: string;
  status: UnlockStatus;
}

export interface ClashResult {
  clashId: string;
  winningSide: Side;
  score: JuryScore;
  verdict: string;
  alignment: Alignment;
  /** Total reputation gained by this clash. */
  reputation: number;
  coins: number;
  /** Where the reputation came from — makes the number explainable. */
  events: readonly XpEvent[];
  rankBefore: RankName;
  rankAfter: RankName;
  /** Flavour title of the rank held after the clash (e.g. "Rising Fire"). */
  rankTitle: string;
  /** Progress inside the rank tier, 0..1, before and after the award. */
  progressBefore: number;
  progressAfter: number;
  /** Next tier to climb, for the "X XP to Provocateur" line. */
  nextRankName: RankName | null;
  toNextRank: number;
  resolvedAt: number;
}
