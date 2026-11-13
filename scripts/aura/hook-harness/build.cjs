/*
 * esbuild driver for the mounted-hook harness.
 *
 * Boundaries are replaced by a resolve plugin rather than by `--alias`, because
 * the hook imports them through relative specifiers ('../services/...'), which
 * `--alias` cannot match. Everything else bundles normally, so the hook, the
 * admission model and the transcript store are the real implementations.
 */
const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SHIM = path.join(ROOT, 'scripts/aura/rn-shim');
const HERE = __dirname;

/** Resolve a specifier relative to the importing file. */
function resolve(spec, importer) {
  const base = path.dirname(importer);
  const candidates = [
    spec,
    `${spec}.ts`,
    `${spec}.tsx`,
    `${spec}.js`,
    path.join(spec, 'index.ts'),
    path.join(spec, 'index.tsx'),
  ];
  for (const c of candidates) {
    const p = spec.startsWith('.') ? path.resolve(base, c) : c;
    try {
      if (require('fs').statSync(p).isFile()) return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Rewrite a boundary import to a stub file. Matching is by resolved *path*, so
 * it does not depend on how the importer spelled the specifier.
 */
const BOUNDARIES = [
  ['services/liveArenaService.ts', 'fakes.cjs'],
  ['services/supabaseClient.ts', 'fakes.cjs'],
  ['services/officialRequestStore.ts', 'official-request-store.cjs'],
  ['store/index.ts', 'clash-store.cjs'],
];

const boundaryPlugin = {
  name: 'aura-boundaries',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!args.importer) return null;
      if (args.path === 'react' || args.path === 'react-test-renderer') {
        return { path: args.path, external: true };
      }
      // The hook calls `useFocusEffect`. Aliasing the whole package also keeps
      // react-navigation (and its PNG assets) out of the bundle.
      if (args.path === 'expo-router') {
        return { path: path.join(HERE, 'fakes.cjs') };
      }
      const resolved = resolve(args.path, args.importer);
      if (!resolved) return null;
      for (const [target, stub] of BOUNDARIES) {
        if (resolved.endsWith(path.sep + target.split('/').join(path.sep))) {
          return { path: path.join(HERE, stub) };
        }
      }
      if (resolved.startsWith(path.join(ROOT, 'node_modules'))) return null;
      return { path: resolved };
    });
  },
};

esbuild
  .build({
    entryPoints: [path.join(HERE, 'duel-history.mounted.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(ROOT, '.aura-hook-harness.cjs'),
    banner: { js: `require(${JSON.stringify(path.join(SHIM, 'globals.cjs'))});` },
    alias: {
      'react-native': path.join(SHIM, 'react-native.js'),
      'react-native-safe-area-context': path.join(SHIM, 'noop.js'),
      'react-native-reanimated': path.join(SHIM, 'reanimated.js'),
      'react-native-svg': path.join(SHIM, 'noop.js'),
      '@sentry/react-native': path.join(SHIM, 'noop.js'),
      '@react-native-async-storage/async-storage': path.join(SHIM, 'noop.js'),
      'expo-modules-core': path.join(SHIM, 'expo-modules.js'),
      'expo-constants': path.join(SHIM, 'expo-modules.js'),
    },
    plugins: [boundaryPlugin],
    loader: { '.png': 'empty', '.ttf': 'empty', '.otf': 'empty' },
    jsx: 'automatic',
    logLevel: 'error',
  })
  .then(() => {
    require(path.join(ROOT, '.aura-hook-harness.cjs'));
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
