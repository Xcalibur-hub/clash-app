const { getDefaultConfig } = require('expo/metro-config');

/** Keep Metro scoped to this probe app — do not load the root CLASH metro config. */
const config = getDefaultConfig(__dirname);

module.exports = config;
