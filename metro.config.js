// Sentry Metro config assigns Debug IDs for source-map upload on EAS builds.
// See: https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Avoid package "exports" dead-ends inside posthog-react-native (and similar).
// Analytics imports the core client via services/posthogClient.ts instead of the
// package index; this keeps relative deep files resolvable if anything else
// touches the package.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
