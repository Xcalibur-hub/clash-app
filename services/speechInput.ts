/**
 * Voice input for a digital creator room (Phase 15.5B).
 *
 * Voice is only ever another way to TYPE: a capture would be transcribed and
 * handed to the existing Creator AI pipeline, which stays the only thing that
 * decides what is said. Nothing here can widen knowledge or access.
 *
 * HONESTY FIRST: this build ships no audio recorder and no speech service, so
 * capture reports itself unavailable instead of pretending. Text always works —
 * that is a product rule, not a fallback we are embarrassed about.
 *
 * PRIVACY: raw microphone audio is never persisted, never attached to a
 * message and never becomes creator knowledge. Any future implementation must
 * transcribe transiently and discard the audio immediately in memory; a fan's
 * voice is not training data.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export type VoiceInputAvailability = 'ready' | 'recorder_unavailable' | 'speech_service_unavailable';

interface NativeAudioRecorder {
  requestRecordingPermissionsAsync?: () => Promise<{ granted?: boolean }>;
}

/** Probe once, at call time: a stale client may lack the native module. */
export function recorderAvailable(): boolean {
  const native = requireOptionalNativeModule<NativeAudioRecorder>('ExpoAudio');
  return typeof native?.requestRecordingPermissionsAsync === 'function';
}

/**
 * Is voice input usable right now?
 *
 * `speechProviderConfigured` comes from the server (the same capability probe
 * the room uses), so a client can never talk itself into voice mode.
 */
export function voiceInputAvailability(speechProviderConfigured: boolean): VoiceInputAvailability {
  if (!recorderAvailable()) return 'recorder_unavailable';
  if (!speechProviderConfigured) return 'speech_service_unavailable';
  return 'ready';
}

export interface VoiceCaptureResult {
  ok: boolean;
  /** Transcribed text, when a capture actually happened. */
  transcript: string | null;
  reason: VoiceInputAvailability;
}

/**
 * Start a capture. Returns "unavailable" rather than a fake transcript: the UI
 * must never display words the fan did not say.
 */
export function beginVoiceCapture(
  availability: VoiceInputAvailability,
): { ok: boolean; reason: VoiceInputAvailability } {
  return availability === 'ready'
    ? { ok: true, reason: 'ready' }
    : { ok: false, reason: availability };
}

export function endVoiceCapture(
  availability: VoiceInputAvailability,
): VoiceCaptureResult {
  // No recorder means no audio ever existed, so there is nothing to transcribe.
  return { ok: false, transcript: null, reason: availability };
}
