/** Expo module stand-ins for the render check (all native-only). */
const noop = () => undefined;
module.exports = {
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
    manifest: {},
    // expo-status-bar / expo-system-ui surfaces
    setBackgroundColorAsync: async () => undefined,
  },
  StatusBar: () => null,
  setBackgroundColorAsync: async () => undefined,
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: async () => undefined,
  LinearGradient: () => null,
  Constants: { expoConfig: { extra: {} } },
  ExecutionEnvironment: { ExecutionEnvironment: 'bare' },
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => ({}),
  Platform: { OS: 'android' },
  CodedError: class extends Error {},
  noop,
};
