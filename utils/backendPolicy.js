"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.assertBackendAllowed = assertBackendAllowed;
exports.assertNativeVariant = assertNativeVariant;
exports.backendStorageKey = backendStorageKey;
exports.resolveAppVariant = resolveAppVariant;
function resolveAppVariant(value) {
  if (value === undefined) return 'production';
  if (value === 'development' || value === 'preview' || value === 'staging' || value === 'production') return value;
  throw new Error('Unknown CLASH app variant');
}
function assertBackendAllowed(variant, url, origins) {
  if (variant === 'development') return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Hosted backend is not configured');
  }
  const allowed = variant === 'staging' ? origins.staging : origins.production;
  const other = variant === 'staging' ? origins.production : origins.staging;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' && parsed.pathname !== '' || !allowed.includes(parsed.origin) || other.includes(parsed.origin)) {
    throw new Error('Backend is not approved for this CLASH app variant');
  }
}
function backendStorageKey(url) {
  return `sb-clash:${encodeURIComponent(new URL(url).origin)}:auth-token`;
}
function assertNativeVariant(variant, applicationId) {
  // Expo Go has no CLASH identity. Staging always needs its standalone client.
  if (variant === 'staging' && applicationId !== 'com.clash.v2.staging') throw new Error('Staging bundle requires the CLASH staging app');
  if (applicationId === 'com.clash.v2.staging' && variant !== 'staging') throw new Error('Staging app refuses another bundle variant');
  if (applicationId === 'com.clash.v2' && variant !== 'production' && variant !== 'preview') throw new Error('Production app refuses a non-production bundle');
}
