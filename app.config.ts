import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo app configuration.
 *
 * `app.json` stays the base — Expo hands it to this file as `config`, so the
 * app's shape is still readable in one place. This file adds the one thing JSON
 * cannot express: an environment variant.
 *
 * `APP_VARIANT` is set by the EAS build profiles in `eas.json`
 * (`development` / `preview` / `production`) and falls back to `production`, so
 * `npx expo start` and a release build keep the exact identity they have today.
 * Only development is re-named, which is what lets a dev build and a store build
 * live on the same device without overwriting each other — and stops a dev deep
 * link from opening the live app.
 *
 * Supabase credentials are deliberately NOT read here: Expo inlines
 * `EXPO_PUBLIC_*` from the environment at build time, and keeping keys out of
 * this file means none can be baked into committed config.
 *
 * Sentry source-map upload (EAS): set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
 * `SENTRY_PROJECT` as EAS secrets/env — never commit those values.
 */

const VARIANTS = ['development', 'preview', 'production'] as const;

type Variant = (typeof VARIANTS)[number];

function resolveVariant(value: string | undefined): Variant {
  return VARIANTS.find((variant) => variant === value) ?? 'production';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const isDevelopment = variant === 'development';
  const applicationId = isDevelopment ? 'com.clash.v2.dev' : 'com.clash.v2';

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
    plugins: [...(config.plugins ?? []), 'expo-video', 'expo-localization', sentryPlugin],
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
