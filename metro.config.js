// Sentry Metro config assigns Debug IDs for source-map upload on EAS builds.
// See: https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
