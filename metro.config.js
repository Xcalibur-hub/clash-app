// Sentry Metro config assigns Debug IDs for source-map upload on EAS builds.
// See: https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // CLASH only needs the PostHog core client. The package entry (dist/index.js)
  // re-exports React Navigation hooks; Metro + package "exports" often fails to
  // resolve those relative ./hooks/* files. Point at posthog-rn.js instead.
  if (moduleName === 'posthog-react-native') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(
        __dirname,
        'node_modules/posthog-react-native/dist/posthog-rn.js',
      ),
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
