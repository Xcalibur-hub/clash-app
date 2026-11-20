/**
 * npm run adb:reverse-supabase
 * Forward only the local Clash API gateway port to a USB-connected Android device.
 */
import { adbReverseSupabase } from './local-supabase-env.mjs';

adbReverseSupabase();
