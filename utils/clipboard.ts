/**
 * Clipboard helper that never imports `expo-clipboard`.
 *
 * Stale/dev clients without a native rebuild lack ExpoClipboard; loading
 * `expo-clipboard` throws at module init. We probe the native module optionally
 * via expo-modules-core instead, and fall back to Share when it is absent.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Share } from 'react-native';

export type ClipboardResult = 'copied' | 'shared' | 'failed';

type NativeClipboard = {
  setStringAsync?: (text: string, options?: Record<string, unknown>) => Promise<boolean>;
};

/** Copy to system clipboard; fall back to Share if native clipboard is unavailable. */
export async function copyTextToClipboard(value: string): Promise<ClipboardResult> {
  const native = requireOptionalNativeModule<NativeClipboard>('ExpoClipboard');
  if (typeof native?.setStringAsync === 'function') {
    try {
      await native.setStringAsync(value, {});
      return 'copied';
    } catch {
      /* fall through to Share */
    }
  }

  try {
    await Share.share({ message: value });
    return 'shared';
  } catch {
    return 'failed';
  }
}
