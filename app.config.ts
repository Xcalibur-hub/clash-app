import type { ConfigContext, ExpoConfig } from 'expo/config';
import { createHash } from 'node:crypto';
import approvedTargets from './config/release-targets.json';

/**
 * Expo app configuration.
 *
 * `app.json` stays the base — Expo hands it to this file as `config`, so the
 * app's shape is still readable in one place. This file adds the one thing JSON
 * cannot express: an environment variant.
 *
 * APP_VARIANT is mandatory, including local commands. Development retains local QA.
 * Preview/production require separately reviewed target and public-key approval.
 * Validation never returns credentials in Expo config or includes them in errors.
 *
 * Sentry source-map upload (EAS): set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
 * `SENTRY_PROJECT` as EAS secrets/env — never commit those values.
 */

const VARIANTS = ['development', 'preview', 'production'] as const;

type Variant = (typeof VARIANTS)[number];

function resolveVariant(value: string | undefined): Variant {
  const variant = VARIANTS.find((variant) => variant === value);
  if (!variant) throw new Error('Set APP_VARIANT explicitly to development, preview or production.');
  return variant;
}

interface ApprovedTarget { projectRef: string; supabaseUrl: string; publicKeySha256: string }
/** Approval is an owner-reviewed pin, not cryptographic verification of JWTs or opaque keys. */
function validateReleaseEnvironment(): void {
  const targets: Record<string, ApprovedTarget> = approvedTargets;
  const selection = process.env.CLASH_RELEASE_TARGET ?? '';
  if (!Object.hasOwn(targets, selection)) {
    throw new Error('Release target approval required in config/release-targets.json; select CLASH_RELEASE_TARGET.');
  }
  const target = targets[selection];
  if (!/^[a-z0-9]{20}$/.test(target.projectRef) || !/^[a-f0-9]{64}$/.test(target.publicKeySha256)) {
    throw new Error('Invalid release-target approval record.');
  }
  const approvedOrigin = `https://${target.projectRef}.supabase.co`;
  // Only standard hosted Supabase project origins are approved by this contract.
  // Thus IPs, emulator/private/link-local aliases and custom domains fail closed.
  let url: URL;
  try { url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''); }
  catch { throw new Error('Release requires the approved HTTPS Supabase origin.'); }
  if (target.supabaseUrl !== approvedOrigin || url.origin !== approvedOrigin ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Release requires the approved HTTPS Supabase origin.');
  }
  const key: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (key.startsWith('sb_secret_')) throw new Error('Privileged credentials cannot be used by a public client.');
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) {
    try {
      const parts = key.split('.');
      if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
      const header: { alg?: string } = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const claims: { role?: string; ref?: string; exp?: number } = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (header.alg !== 'HS256' || claims.role !== 'anon' || claims.ref !== target.projectRef ||
          !Number.isFinite(claims.exp) || (claims.exp ?? 0) * 1000 <= Date.now() ||
          Buffer.from(parts[2], 'base64url').length !== 32) throw new Error();
    } catch { throw new Error('Release requires an approved public-client credential.'); }
  }
  if (createHash('sha256').update(key).digest('hex') !== target.publicKeySha256) {
    throw new Error('Public-client credential does not match the approved target fingerprint.');
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const isDevelopment = variant === 'development';
  const applicationId = isDevelopment ? 'com.clash.v2.dev' : 'com.clash.v2';

  if (!isDevelopment) validateReleaseEnvironment();

  const sentryOrg = process.env.SENTRY_ORG?.trim();
  const sentryProject = process.env.SENTRY_PROJECT?.trim();
  const sentryPlugin: NonNullable<ExpoConfig['plugins']>[number] = [
    '@sentry/react-native/expo',
    {
      url: 'https://sentry.io/',
      note: 'Use SENTRY_AUTH_TOKEN env to authenticate with Sentry.',
      ...(sentryOrg ? { organization: sentryOrg } : {}),
      ...(sentryProject ? { project: sentryProject } : {}),
    },
  ];

  return {
    ...config,
    name: isDevelopment ? 'CLASH (Dev)' : 'CLASH',
    slug: isDevelopment ? 'clash-dev' : 'clash',
    scheme: isDevelopment ? 'clash-dev' : 'clash',
    plugins: [
      ...(config.plugins ?? []),
      'expo-video',
      'expo-localization',
      'expo-camera',
      [
        '@config-plugins/react-native-webrtc',
        {
          cameraPermission:
            'CLASH uses your camera for Meet Video so you can talk face to face with someone new.',
          microphonePermission:
            'CLASH uses your microphone for Meet Video so the other person can hear you.',
        },
      ],
      sentryPlugin,
    ],
    extra: {
      ...config.extra,
      appVariant: variant,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: applicationId,
      config: {
        ...config.ios?.config,
        // Optional: Apple Maps is default on iOS. Set only if forcing Google Maps.
        ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
          ? { googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY }
          : {}),
      },
    },
    android: {
      ...config.android,
      package: applicationId,
      // DEVELOPMENT ONLY: allow http://127.0.0.1 for local Supabase via adb reverse.
      // Preview/production builds never set this — HTTPS hosted Supabase only.
      ...(isDevelopment ? { usesCleartextTraffic: true } : {}),
      config: {
        ...config.android?.config,
        // Required for production Google Maps on Android store/dev builds.
        // Expo Go ships with a shared key; leave empty for Expo Go testing.
        ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
          ? { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY } }
          : {}),
      },
    },
  };
};
