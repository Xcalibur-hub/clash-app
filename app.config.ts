import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Existing dev/production identities stay unchanged. Staging has a separate
 * package/scheme and requires reviewed backend origins. No endpoint or key is
 * stored here; Expo still inlines EXPO_PUBLIC_* at bundle time.
 */

import { resolveAppVariant, assertBackendAllowed } from './utils/backendPolicy';
import backendOrigins from './config/backend-origins.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveAppVariant(process.env.APP_VARIANT);
  const isDevelopment = variant === 'development';
  const isStaging = variant === 'staging';
  const applicationId = isDevelopment ? 'com.clash.v2.dev' : isStaging ? 'com.clash.v2.staging' : 'com.clash.v2';

  // Guard: EAS/CI must never bake a local Docker URL into preview/production.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const isCiBuild = Boolean(process.env.EAS_BUILD || process.env.CI);
  if (isStaging || (isCiBuild && !isDevelopment)) assertBackendAllowed(variant, supabaseUrl, backendOrigins);

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
    name: isDevelopment ? 'CLASH (Dev)' : isStaging ? 'CLASH (Staging)' : 'CLASH',
    slug: isDevelopment ? 'clash-dev' : isStaging ? 'clash-staging' : 'clash',
    scheme: isDevelopment ? 'clash-dev' : isStaging ? 'clash-staging' : 'clash',
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
