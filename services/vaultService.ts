/**
 * Vault data API (Phase 3 Step 1).
 *
 * One function per Vault operation, each answering with the domain types in
 * `services/vaultMappers.ts`, so screens never touch a Supabase row or learn a
 * second vocabulary. Two rules hold everywhere in this file:
 *
 *   1. No screen supplies a creator id as authority. Every write goes through a
 *      SECURITY DEFINER RPC that resolves the caller from the session
 *      (`my_profile_id()`), so ids passed in here only ever *choose which Vault
 *      to act on* — they never authenticate anyone.
 *   2. Entitlement is never decided in the client. Reads lean on RLS, and the
 *      single authoritative predicate is the server's `can_access_vault_drop`,
 *      exposed below as `canAccessDrop` so no screen re-implements the rules.
 *
 * Private media goes through `requestPrivateMediaAccess`, which asks the
 * `vault-media-access` Edge Function for a short-lived signed URL. Subscriber
 * content has no public URL for the app to leak in the first place.
 */

import { currentViewerProfileId } from './apiService';
import { currentUserId, requestError, requireSupabase, SupabaseError } from './supabaseClient';
import {
  toCreatorVault,
  toStorefrontDrop,
  toStorefrontList,
  toVaultCollection,
  toVaultDrop,
  type CreatorVault,
  type StorefrontDrop,
  type VaultCollection,
  type VaultDrop,
  type VaultSubscriptionState,
} from './vaultMappers';
import type { VaultDropAccess } from '../supabase/types';

/** A short-lived private-media grant. Never cached, never persisted. */
export interface PrivateMediaAccess {
  url: string;
  bucket: string;
  mediaKind: string;
  /** Seconds the signed URL stays valid — the Edge Function decides this. */
  expiresIn: number;
}

// ── Creator operations ──────────────────────────────────────────────────────

/** The signed-in creator's own Vault, or null when they have not opened one. */
export async function fetchMyVault(): Promise<CreatorVault | null> {
  const me = await currentViewerProfileId();
  if (!me) return null;
  const { data, error } = await requireSupabase()
    .from('creator_vaults')
    .select('*')
    .eq('creator_id', me)
    .maybeSingle();
  if (error) throw requestError(error);
  return data ? toCreatorVault(data) : null;
}

/** Opens the caller's Vault. Fails if they already have one (one Vault each). */
export async function createVault(title: string, description = ''): Promise<CreatorVault> {
  const { data, error } = await requireSupabase().rpc('create_vault', {
    p_title: title,
    p_description: description,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_vault returned no row', 'bad_payload');
  return toCreatorVault(data);
}

export async function updateVault(
  vaultId: string,
  title: string,
  description = '',
): Promise<CreatorVault> {
  const { data, error } = await requireSupabase().rpc('update_vault', {
    p_vault_id: vaultId,
    p_title: title,
    p_description: description,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('update_vault returned no row', 'bad_payload');
  return toCreatorVault(data);
}

/**
 * Creates a draft Drop. The media rules live in the database, not here: a
 * `subscriber` Drop can only reference private media the caller owns and has
 * finished uploading, and a `free` Drop can only reference public media.
 */
export async function createDrop(
  vaultId: string,
  caption: string,
  accessLevel: VaultDropAccess,
  mediaObjectId?: string,
): Promise<VaultDrop> {
  const { data, error } = await requireSupabase().rpc('create_vault_drop', {
    p_vault_id: vaultId,
    p_caption: caption,
    p_access_level: accessLevel,
    ...(mediaObjectId ? { p_media_object_id: mediaObjectId } : {}),
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_vault_drop returned no row', 'bad_payload');
  return toVaultDrop(data);
}

/**
 * Publishes a draft. The server stamps the window — exactly 7 days from now — so
 * no client can choose, extend or shorten it, and there is no parameter through
 * which one could try.
 */
export async function publishDrop(dropId: string): Promise<VaultDrop> {
  const { data, error } = await requireSupabase().rpc('publish_vault_drop', {
    p_drop_id: dropId,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('publish_vault_drop returned no row', 'bad_payload');
  return toVaultDrop(data);
}

/**
 * Retracts a Drop. A tombstone, not a delete: any Collection holding it keeps its
 * structure, and the media row is untouched.
 */
export async function deleteDrop(dropId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('delete_vault_drop', { p_drop_id: dropId });
  if (error) throw requestError(error);
}

/** Starts a permanent Collection. A Collection has no expiry of its own. */
export async function createCollection(
  vaultId: string,
  title: string,
  description = '',
): Promise<VaultCollection> {
  const { data, error } = await requireSupabase().rpc('create_collection', {
    p_vault_id: vaultId,
    p_title: title,
    p_description: description,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_collection returned no row', 'bad_payload');
  return toVaultCollection(data, []);
}

/** Shelves a Drop. Allowed for an expired Drop too — that is what permanence means. */
export async function addToCollection(collectionId: string, dropId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('add_drop_to_collection', {
    p_collection_id: collectionId,
    p_drop_id: dropId,
  });
  if (error) throw requestError(error);
}

export async function removeFromCollection(collectionId: string, dropId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('remove_drop_from_collection', {
    p_collection_id: collectionId,
    p_drop_id: dropId,
  });
  if (error) throw requestError(error);
}

// ── Viewer operations ───────────────────────────────────────────────────────

/**
 * A creator's Vault. Readable by anyone while it is `active`; a draft or
 * suspended Vault resolves to null for everyone but its owner (RLS).
 */
export async function fetchVault(creatorId: string): Promise<CreatorVault | null> {
  const { data, error } = await requireSupabase()
    .from('creator_vaults')
    .select('*')
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (error) throw requestError(error);
  return data ? toCreatorVault(data) : null;
}

/** The live free shelf: published, still inside its 7-day window, `free`. */
export async function fetchFreeDrops(vaultId: string): Promise<VaultDrop[]> {
  const { data, error } = await requireSupabase()
    .from('vault_drops')
    .select('*')
    .eq('vault_id', vaultId)
    .eq('access_level', 'free')
    .eq('status', 'published')
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(60);
  if (error) throw requestError(error);
  return data.map(toVaultDrop);
}

/**
 * Everything this viewer may read from a Vault — the live shelf plus any Drop a
 * Collection holds permanently. No entitlement logic is written here on purpose:
 * RLS removes what the viewer may not see, so subscriber extras appear only when
 * `can_access_vault_drop` says they may.
 */
export async function fetchAccessibleDrops(vaultId: string): Promise<VaultDrop[]> {
  const { data, error } = await requireSupabase()
    .from('vault_drops')
    .select('*')
    .eq('vault_id', vaultId)
    .in('status', ['published', 'expired'])
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(120);
  if (error) throw requestError(error);
  return data.map(toVaultDrop);
}

/**
 * The whole storefront in one round trip: every Drop the caller should see —
 * live, archived-in-a-Collection, and (for the owner) drafts — each with the
 * server's single `accessible` decision, its collection membership, and a public
 * media path only for free Drops. Subscriber Drops carry no media path here.
 *
 * The viewer's Vault and the creator's management view both read this; no screen
 * re-derives entitlement.
 */
export async function fetchStorefront(vaultId: string): Promise<StorefrontDrop[]> {
  const { data, error } = await requireSupabase().rpc('vault_storefront', {
    p_vault_id: vaultId,
  });
  if (error) throw requestError(error);
  return toStorefrontList(data);
}

/**
 * One Drop's storefront card. Null for a removed Drop, an id that does not exist,
 * or someone else's draft. A locked subscriber Drop still returns a card
 * (`accessible: false`, `publicMedia: null`) so the reader can render its locked
 * state without ever touching private media.
 */
export async function fetchDrop(dropId: string): Promise<StorefrontDrop | null> {
  const { data, error } = await requireSupabase().rpc('vault_drop_card', {
    p_drop_id: dropId,
  });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toStorefrontDrop(data);
}

/** The Vault's Collections with their items — the permanent shelves. */
export async function fetchCollections(vaultId: string): Promise<VaultCollection[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from('vault_collections')
    .select('*')
    .eq('vault_id', vaultId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw requestError(error);
  if (rows.length === 0) return [];

  const { data: items, error: itemError } = await client
    .from('vault_collection_items')
    .select('collection_id, drop_id, position')
    .in('collection_id', rows.map((row) => row.id))
    .order('position', { ascending: true });
  if (itemError) throw requestError(itemError);

  const dropIds = items.map((item) => item.drop_id);
  let drops: VaultDrop[] = [];
  if (dropIds.length > 0) {
    const { data: dropRows, error: dropError } = await client
      .from('vault_drops')
      .select('*')
      .in('id', dropIds);
    if (dropError) throw requestError(dropError);
    drops = dropRows.map(toVaultDrop);
  }
  const byId = new Map<string, VaultDrop>(drops.map((drop) => [drop.id, drop]));

  return rows.map((row) =>
    toVaultCollection(
      row,
      items
        .filter((item) => item.collection_id === row.id)
        .map((item) => byId.get(item.drop_id))
        .filter((drop): drop is VaultDrop => drop !== undefined),
    ),
  );
}

/**
 * The viewer's entitlement state for one Vault. RLS returns only their own row,
 * so a creator asking about their own Vault correctly learns nothing about who
 * subscribes to them.
 */
export async function fetchSubscriptionState(vaultId: string): Promise<VaultSubscriptionState> {
  const empty: VaultSubscriptionState = {
    vaultId,
    status: null,
    currentPeriodEnd: null,
    active: false,
  };
  const me = await currentViewerProfileId();
  if (!me) return empty;

  const { data, error } = await requireSupabase()
    .from('vault_subscriptions')
    .select('*')
    .eq('vault_id', vaultId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return empty;

  const currentPeriodEnd = Date.parse(data.current_period_end);
  return {
    vaultId,
    status: data.status,
    currentPeriodEnd,
    active: (data.status === 'active' || data.status === 'trial') && currentPeriodEnd > Date.now(),
  };
}

/**
 * The one entitlement question the app ever asks, answered by the database. Use
 * this instead of re-deriving "is this free, am I subscribed, are we blocked" in
 * a screen — the server's answer is the authoritative one, and it is the same
 * function the RLS policies and the media Edge Function call.
 */
export async function canAccessDrop(dropId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('viewer_can_access_drop', {
    p_drop_id: dropId,
  });
  if (error) throw requestError(error);
  return data === true;
}

function toPrivateMediaAccess(payload: unknown): PrivateMediaAccess {
  if (payload !== null && typeof payload === 'object') {
    const record = payload as { [key: string]: unknown };
    const { url, bucket, mediaKind, expiresIn } = record;
    if (
      typeof url === 'string' &&
      typeof bucket === 'string' &&
      typeof mediaKind === 'string' &&
      typeof expiresIn === 'number'
    ) {
      return { url, bucket, mediaKind, expiresIn };
    }
  }
  throw new SupabaseError('The media service returned an unexpected payload', 'bad_payload');
}

/**
 * A short-lived signed URL for a Drop's media.
 *
 * The request carries a Drop id and nothing else: the `vault-media-access` Edge
 * Function resolves the viewer from the verified JWT, asks Postgres whether that
 * viewer may read the Drop, and only then signs the object server-side with a key
 * that never leaves the runtime. A refusal means no entitlement (or a block, or a
 * retracted Drop) — never a URL.
 */
export async function requestPrivateMediaAccess(dropId: string): Promise<PrivateMediaAccess> {
  const userId = await currentUserId();
  if (!userId) throw new SupabaseError('Sign in to watch this drop.', 'auth_required');

  const { data, error } = await requireSupabase().functions.invoke<PrivateMediaAccess>(
    'vault-media-access',
    { body: { dropId } },
  );
  // A non-2xx from the function arrives as a FunctionsError, and its body is not
  // trusted: the only thing the caller learns is "not available to you".
  if (error) throw new SupabaseError('This drop is not available to you.', 'media_access_denied');
  return toPrivateMediaAccess(data);
}

/**
 * THE PAYMENT SEAM — deliberately not implemented.
 *
 * No payment provider is connected yet, so there is nothing to call and no
 * entitlement to create. This exists so the UI has one honest place to find out,
 * and it explicitly does NOT unlock anything: the client has no write path to
 * `vault_subscriptions` at all (migration 0016), so even a faked "success" here
 * could not grant access.
 *
 * When a provider lands, its verified webhook activates the entitlement
 * server-side and the app simply re-reads `fetchSubscriptionState`. This function
 * never becomes the authority.
 */
export async function requestDropCheckout(dropId: string): Promise<never> {
  void dropId;
  throw new SupabaseError(
    'Checkout is not open yet — no payment provider is connected.',
    'payments_unavailable',
  );
}

