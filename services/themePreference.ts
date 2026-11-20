/**
 * Local appearance preference — independent of auth.
 * Stored in AsyncStorage so System/Light/Dark survives restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '../store/types';

const KEY = '@clash/themeMode';

const VALID: ReadonlySet<string> = new Set(['system', 'light', 'dark']);

export async function loadThemeMode(): Promise<ThemeMode | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw && VALID.has(raw)) return raw as ThemeMode;
    return null;
  } catch {
    return null;
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, mode);
  } catch {
    /* preference persistence is best-effort */
  }
}
