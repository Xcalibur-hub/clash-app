/**
 * Babel config for CLASH v2 (Expo SDK 54, Reanimated 4).
 *
 * IMPORTANT: `babel-preset-expo` automatically adds the Reanimated/Worklets Babel
 * plugin when the package is installed (see babel-preset-expo/build/index.js:284-291).
 * With Reanimated 4 it injects `react-native-worklets/plugin`, falling back to
 * `react-native-reanimated/plugin` otherwise.
 *
 * We must NOT add either plugin manually here, or the worklet transform is applied twice.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};