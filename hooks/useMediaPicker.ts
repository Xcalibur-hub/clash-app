import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { MediaKind } from '../store/types';

/**
 * Typed media selection. UI calls `pickImage` / `pickVideo`; this stays the only
 * place expo-image-picker is imported, so the storage flow and the picker stay
 * decoupled.
 */

export interface PickedMedia {
  uri: string;
  kind: MediaKind;
  mimeType: string | null;
  width: number;
  height: number;
  durationMs: number | null;
  fileSize: number | null;
}

export function useMediaPicker(): {
  pickImage: () => Promise<PickedMedia | null>;
  pickVideo: () => Promise<PickedMedia | null>;
} {
  const pick = useCallback(async (mediaTypes: ['images'] | ['videos']): Promise<PickedMedia | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.85 });
    if (result.canceled || result.assets.length === 0) return null;

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      kind: asset.type === 'video' ? 'video' : 'image',
      mimeType: asset.mimeType ?? null,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration ?? null,
      fileSize: asset.fileSize ?? null,
    };
  }, []);

  return {
    pickImage: useCallback(() => pick(['images']), [pick]),
    pickVideo: useCallback(() => pick(['videos']), [pick]),
  };
}
