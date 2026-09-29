/**
 * World API — Missions + location-safe Drops.
 *
 * Screens never touch `world_drops` / `world_missions` tables directly.
 * Precise coordinates are sent only into RPCs; the server fuzzes before
 * persistence and nearby queries never store the viewer's position.
 *
 * No live markers, trails, heatmaps, or background tracking live here.
 */

import type { Json } from '../supabase/types';
import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

export type WorldMissionStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
export type WorldDropStatus = 'DRAFT' | 'PUBLISHED' | 'EXPIRED' | 'REMOVED';
export type WorldDistanceBand = '< 1 km' | '1–3 km' | '3–10 km' | '10–25 km' | '25+ km';

export interface WorldMission {
  id: string;
  title: string;
  description: string;
  prompt: string;
  status: WorldMissionStatus;
  startsAt: number;
  endsAt: number;
}

export interface WorldDropAuthor {
  id: string;
  handle: string;
  name: string;
  avatarTint: string;
}

export interface WorldDropMedia {
  id: string;
  kind: 'image' | 'video';
  url: string;
}

export interface WorldDrop {
  id: string;
  missionId: string | null;
  caption: string;
  status: WorldDropStatus;
  publishedAt: number | null;
  expiresAt: number | null;
  locationLabel: string | null;
  approxLat: number;
  approxLng: number;
  distanceBand: WorldDistanceBand | null;
  author: WorldDropAuthor | null;
  media: WorldDropMedia | null;
  mission: { id: string; title: string; prompt: string } | null;
}

export interface WorldCoordinates {
  latitude: number;
  longitude: number;
}

function asMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toMission(value: unknown): WorldMission | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as { [key: string]: unknown };
  const startsAt = asMillis(r.startsAt);
  const endsAt = asMillis(r.endsAt);
  if (
    typeof r.id !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.description !== 'string' ||
    typeof r.prompt !== 'string' ||
    (r.status !== 'DRAFT' && r.status !== 'ACTIVE' && r.status !== 'ENDED' && r.status !== 'CANCELLED') ||
    startsAt === null ||
    endsAt === null
  ) {
    return null;
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    prompt: r.prompt,
    status: r.status,
    startsAt,
    endsAt,
  };
}

function toDrop(value: unknown): WorldDrop | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as { [key: string]: unknown };
  const approxLat = asNumber(r.approxLat);
  const approxLng = asNumber(r.approxLng);
  if (
    typeof r.id !== 'string' ||
    typeof r.caption !== 'string' ||
    (r.status !== 'DRAFT' && r.status !== 'PUBLISHED' && r.status !== 'EXPIRED' && r.status !== 'REMOVED') ||
    approxLat === null ||
    approxLng === null
  ) {
    return null;
  }

  let author: WorldDropAuthor | null = null;
  if (r.author && typeof r.author === 'object' && !Array.isArray(r.author)) {
    const a = r.author as { [key: string]: unknown };
    if (
      typeof a.id === 'string' &&
      typeof a.handle === 'string' &&
      typeof a.name === 'string' &&
      typeof a.avatarTint === 'string'
    ) {
      author = { id: a.id, handle: a.handle, name: a.name, avatarTint: a.avatarTint };
    }
  }

  let media: WorldDropMedia | null = null;
  if (r.media && typeof r.media === 'object' && !Array.isArray(r.media)) {
    const m = r.media as { [key: string]: unknown };
    if (
      typeof m.id === 'string' &&
      typeof m.bucket === 'string' &&
      typeof m.path === 'string' &&
      (m.kind === 'image' || m.kind === 'video')
    ) {
      media = {
        id: m.id,
        kind: m.kind,
        url: getPublicMediaUrl(m.bucket, m.path),
      };
    }
  }

  let mission: WorldDrop['mission'] = null;
  if (r.mission && typeof r.mission === 'object' && !Array.isArray(r.mission)) {
    const miss = r.mission as { [key: string]: unknown };
    if (typeof miss.id === 'string' && typeof miss.title === 'string' && typeof miss.prompt === 'string') {
      mission = { id: miss.id, title: miss.title, prompt: miss.prompt };
    }
  }

  const band = r.distanceBand;
  const distanceBand: WorldDistanceBand | null =
    band === '< 1 km' || band === '1–3 km' || band === '3–10 km' || band === '10–25 km' || band === '25+ km'
      ? band
      : null;

  return {
    id: r.id,
    missionId: typeof r.missionId === 'string' ? r.missionId : null,
    caption: r.caption,
    status: r.status,
    publishedAt: asMillis(r.publishedAt),
    expiresAt: asMillis(r.expiresAt),
    locationLabel: typeof r.locationLabel === 'string' ? r.locationLabel : null,
    approxLat,
    approxLng,
    distanceBand,
    author,
    media,
    mission,
  };
}

function toDropList(payload: Json | null): WorldDrop[] {
  if (!Array.isArray(payload)) {
    throw new SupabaseError('world list returned an unexpected payload', 'bad_payload');
  }
  return payload.map(toDrop).filter((d): d is WorldDrop => d !== null);
}

export async function fetchActiveMissions(): Promise<WorldMission[]> {
  const { data, error } = await requireSupabase().rpc('world_active_missions');
  if (error) throw requestError(error);
  if (!Array.isArray(data)) return [];
  return data.map(toMission).filter((m): m is WorldMission => m !== null);
}

export async function fetchMission(id: string): Promise<WorldMission | null> {
  const { data, error } = await requireSupabase().rpc('world_mission', { p_mission_id: id });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toMission(data);
}

export async function fetchNearbyWorldDrops(
  location: WorldCoordinates,
  radiusKm = 25,
  limit = 30,
): Promise<WorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('world_nearby', {
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_radius_km: radiusKm,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toDropList(data);
}

export async function fetchRecentWorldDrops(limit = 30): Promise<WorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('world_recent', { p_limit: limit });
  if (error) throw requestError(error);
  return toDropList(data);
}

export async function fetchMissionDrops(missionId: string, limit = 30): Promise<WorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('world_mission_drops', {
    p_mission_id: missionId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toDropList(data);
}

export async function fetchMyWorldDrops(limit = 30): Promise<WorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('world_my_drops', { p_limit: limit });
  if (error) throw requestError(error);
  return toDropList(data);
}

/** Single published Drop card — block/mute aware. Null when missing or hidden. */
export async function fetchWorldDrop(dropId: string): Promise<WorldDrop | null> {
  const { data, error } = await requireSupabase().rpc('world_drop_view', { p_drop_id: dropId });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toDrop(data);
}

export async function createWorldDrop(input: {
  missionId: string;
  mediaObjectId: string;
  caption: string;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_world_drop', {
    p_mission_id: input.missionId,
    p_media_object_id: input.mediaObjectId,
    p_caption: input.caption,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  });
  if (error) throw requestError(error);
  if (typeof data !== 'string') throw new SupabaseError('create_world_drop returned no id', 'bad_payload');
  return data;
}

export async function removeWorldDrop(dropId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('remove_world_drop', { p_drop_id: dropId });
  if (error) throw requestError(error);
}
