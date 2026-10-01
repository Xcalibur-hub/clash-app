/**
 * Clipboard helper that does not crash the JS bundle when the native
 * ExpoClipboard module is missing (stale/dev-client without a rebuild).
 */
import { Share } from 'react-native';

export type ClipboardResult = 'copied' | 'shared' | 'failed';

type ExpoClipboardModule = {
  setStringAsync: (value: string) => Promise<boolean>;
};

function loadExpoClipboard(): ExpoClipboardModule | null {
  try {
    // Lazy require so routes can load even when native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-clipboard') as ExpoClipboardModule;
  } catch {
    return null;
  }
}

/** Copy to system clipboard; fall back to Share if native clipboard is unavailable. */
export async function copyTextToClipboard(value: string): Promise<ClipboardResult> {
  const clipboard = loadExpoClipboard();
  if (clipboard) {
    try {
      await clipboard.setStringAsync(value);
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
