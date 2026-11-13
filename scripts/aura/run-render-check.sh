#!/usr/bin/env bash
# Builds and runs the AURA render check. See render-check.tsx for what it proves.
set -euo pipefail
cd "$(dirname "$0")/../.."
SHIM=scripts/aura/rn-shim
npx esbuild scripts/aura/render-check.tsx --bundle --platform=node --format=cjs \
  --outfile=$PWD/.aura-render-check.cjs \
  --banner:js="require('$PWD/$SHIM/globals.cjs');" \
  --alias:react-native="$PWD/$SHIM/react-native.js" \
  --alias:react-native-safe-area-context="$PWD/$SHIM/noop.js" \
  --alias:react-native-reanimated="$PWD/$SHIM/reanimated.js" \
  --alias:react-native-svg="$PWD/$SHIM/noop.js" \
  --alias:@sentry/react-native="$PWD/$SHIM/noop.js" \
  --alias:@react-native-async-storage/async-storage="$PWD/$SHIM/noop.js" \
  --alias:@expo-google-fonts/inter="$PWD/$SHIM/fonts.js" \
  --alias:expo-modules-core="$PWD/$SHIM/expo-modules.js" \
  --alias:expo-status-bar="$PWD/$SHIM/expo-modules.js" \
  --alias:expo-constants="$PWD/$SHIM/expo-modules.js" \
  --alias:expo-system-ui="$PWD/$SHIM/expo-modules.js" \
  --alias:expo-font="$PWD/$SHIM/expo-modules.js" \
  --external:react --external:react-dom --loader:.ttf=empty --jsx=automatic --log-level=error
node "$PWD/.aura-render-check.cjs"
