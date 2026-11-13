#!/usr/bin/env bash
# Builds and runs the AURA mounted-hook harness.
#
# Unlike the render check (static markup), this mounts `useLiveArenaRoom` for
# real so its effects, guards and async control flow execute. Only module
# boundaries are aliased: Supabase, Expo Router, AsyncStorage, the crash
# reporter, and the Clash store.
#
# The bundling lives in build.cjs — one implementation, so a relative import the
# `--alias` flag cannot express (it matches bare specifiers only) never has to be
# worked around twice.
#
# `negative-control.cjs` runs the same suite against deliberately broken hook and
# fake sources and fails unless the suite goes red for each one.
set -euo pipefail
exec node "$(dirname "$0")/build.cjs" "$@"
