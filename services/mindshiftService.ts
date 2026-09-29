/**
 * Mindshift API. The client records an initial stance and a later final stance;
 * the server derives whether the position changed. Screens never compute the
 * aggregate, never submit `mind_changed`, and never read another person's row.
 *
 * Stats are fetched only after the viewer has a final stance (anti-anchoring:
 * the majority must not influence a first answer, and the Take-detail prompt
 * does not show a percentage at all until they have completed the pair).
 *
 * Profile attribution ("minds you changed") is intentionally deferred: a
 * Take-level percent does not prove which participant caused the movement.
 * Mindshift awards no reputation and no coins.
 */

import { currentViewerProfileId } from './apiService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type { Json } from '../supabase/types';

/** The three positions a viewer may hold. Same labels as the database enum. */
export type Stance = 'AGREE' | 'UNSURE' | 'DISAGREE';

/** Fewest completed pairs before a percentage is shown. Below this, UI is calm. */
export const MINDSHIFT_MIN_COMPLETED = 3;

export interface TakeStanceState {
  takeId: string;
  initialStance: Stance;
  finalStance: Stance | null;
  initialRecordedAt: number;
  finalRecordedAt: number | null;
  /** Null until a final stance exists; then server-derived initial <> final. */
  changed: boolean | null;
}

export interface MindshiftStats {
  takeId: string;
  totalInitialParticipants: number;
  completedParticipants: number;
  changedCount: number;
  /** Null when nobody has completed a pair — not the same as 0% movement. */
  changedPercent: number | null;
}

const STANCES: readonly Stance[] = ['AGREE', 'UNSURE', 'DISAGREE'];

function isStance(value: unknown): value is Stance {
  return typeof value === 'string' && (STANCES as readonly string[]).includes(value);
}

function asMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toStanceState(payload: Json | null): TakeStanceState {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { [key: string]: Json | undefined };
    const takeId = record.takeId;
    const initialStance = record.initialStance;
    const finalStance = record.finalStance;
    const initialAt = asMillis(record.initialRecordedAt);
    const finalAt = record.finalRecordedAt === null ? null : asMillis(record.finalRecordedAt);
    const changed = record.changed;
    if (
      typeof takeId === 'string' &&
      isStance(initialStance) &&
      initialAt !== null &&
      (finalStance === null || isStance(finalStance)) &&
      (changed === null || typeof changed === 'boolean') &&
      (finalAt !== undefined)
    ) {
      return {
        takeId,
        initialStance,
        finalStance: finalStance === null ? null : finalStance,
        initialRecordedAt: initialAt,
        finalRecordedAt: finalStance === null ? null : finalAt,
        changed: changed === null ? null : changed,
      };
    }
  }
  throw new SupabaseError('stance rpc returned an unexpected payload', 'bad_payload');
}

function toStats(payload: Json | null): MindshiftStats {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { [key: string]: Json | undefined };
    const takeId = record.takeId;
    const totalInitialParticipants = record.totalInitialParticipants;
    const completedParticipants = record.completedParticipants;
    const changedCount = record.changedCount;
    const changedPercent = record.changedPercent;
    if (
      typeof takeId === 'string' &&
      typeof totalInitialParticipants === 'number' &&
      typeof completedParticipants === 'number' &&
      typeof changedCount === 'number' &&
      (changedPercent === null || typeof changedPercent === 'number')
    ) {
      return { takeId, totalInitialParticipants, completedParticipants, changedCount, changedPercent };
    }
  }
  throw new SupabaseError('mindshift_stats returned an unexpected payload', 'bad_payload');
}

function client() {
  return requireSupabase();
}

/** The signed-in viewer's stance on this Take, or null when none / guest. */
export async function fetchMyStance(takeId: string): Promise<TakeStanceState | null> {
  const me = await currentViewerProfileId();
  if (!me) return null;
  const { data, error } = await client()
    .from('take_stances')
    .select('*')
    .eq('take_id', takeId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  return {
    takeId: data.take_id,
    initialStance: data.initial_stance,
    finalStance: data.final_stance,
    initialRecordedAt: Date.parse(data.initial_recorded_at),
    finalRecordedAt: data.final_recorded_at ? Date.parse(data.final_recorded_at) : null,
    changed:
      data.final_stance === null ? null : data.initial_stance !== data.final_stance,
  };
}

export async function recordInitialStance(takeId: string, stance: Stance): Promise<TakeStanceState> {
  const { data, error } = await client().rpc('record_initial_stance', {
    p_take_id: takeId,
    p_stance: stance,
  });
  if (error) throw requestError(error);
  return toStanceState(data);
}

export async function recordFinalStance(takeId: string, stance: Stance): Promise<TakeStanceState> {
  const { data, error } = await client().rpc('record_final_stance', {
    p_take_id: takeId,
    p_stance: stance,
  });
  if (error) throw requestError(error);
  return toStanceState(data);
}

export async function fetchMindshiftStats(takeId: string): Promise<MindshiftStats> {
  const { data, error } = await client().rpc('mindshift_stats', { p_take_id: takeId });
  if (error) throw requestError(error);
  return toStats(data);
}
