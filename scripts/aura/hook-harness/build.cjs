/*
 * esbuild driver for the mounted-hook harness.
 *
 * Boundaries are replaced by a resolve plugin rather than by `--alias`, because
 * the hook imports them through relative specifiers ('../services/...'), which
 * `--alias` cannot match. Everything else bundles normally, so the hook, the
 * admission model and the transcript store are the real implementations.
 *
 * `bundle()`/`runSuite()` are exported for the negative-control runner, which
 * builds the same suite against a deliberately broken hook or fake — supplied as
 * source text, so mutation testing never writes into the working tree.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const SHIM = path.join(ROOT, 'scripts/aura/rn-shim');
const HERE = __dirname;

const ENTRY = path.join(HERE, 'duel-history.mounted.test.ts');
const OUTFILE = path.join(ROOT, '.aura-hook-harness.cjs');
const REAL_HOOK = path.join(ROOT, 'hooks', 'useLiveArenaRoom.ts');
const REAL_FAKES = path.join(HERE, 'fakes.cjs');

/**
 * Resolve a specifier relative to the importing file.
 *
 * The base comes from esbuild's `resolveDir`, not from `importer`: an importer
 * served from a virtual namespace has a synthetic path ('hook-override'), so
 * `path.dirname` would point at nothing and the boundary mapping would be
 * skipped — letting the real store into the bundle.
 */
function resolve(spec, importer, resolveDir) {
  const base = resolveDir || path.dirname(importer);
  const candidates = [
    spec,
    `${spec}.ts`,
    `${spec}.tsx`,
    `${spec}.js`,
    path.join(spec, 'index.ts'),
    path.join(spec, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    const target = spec.startsWith('.') ? path.resolve(base, candidate) : candidate;
    try {
      if (fs.statSync(target).isFile()) return target;
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

/**
 * Resolve plugin.
 *
 * `hookOverride` / `fakesOverride` are source *text*, not paths: they are served
 * from a virtual namespace with the real file's directory as `resolveDir`, so a
 * mutant resolves its relative imports exactly like the original and nothing is
 * ever written into the source tree.
 */
const OVERRIDE = 'aura-override';

function boundaryPlugin({ hookOverride = null, fakesOverride = null } = {}) {
  const fakesEntry = fakesOverride
    ? { path: 'fakes-override', namespace: OVERRIDE }
    : { path: REAL_FAKES };
  return {
    name: 'aura-boundaries',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!args.importer) return null;
        if (args.path === 'react' || args.path === 'react-test-renderer') {
          return { path: args.path, external: true };
        }
        // The hook calls `useFocusEffect`. Aliasing the whole package also keeps
        // react-navigation (and its PNG assets) out of the bundle.
        if (args.path === 'expo-router') return fakesEntry;
        const resolved = resolve(args.path, args.importer, args.resolveDir);
        if (!resolved) return null;
        // One rule covers the service stubs, `clash-store.cjs` and the harness:
        // all of them reach the fake server through this path, so they must all
        // see the same (possibly overridden) module instance.
        if (resolved === REAL_FAKES) return fakesEntry;
        if (hookOverride && resolved === REAL_HOOK) {
          return { path: 'hook-override', namespace: OVERRIDE };
        }
        for (const [target, stub] of BOUNDARIES) {
          if (resolved.endsWith(path.sep + target.split('/').join(path.sep))) {
            return stub === 'fakes.cjs' ? fakesEntry : { path: path.join(HERE, stub) };
          }
        }
        if (resolved.startsWith(path.join(ROOT, 'node_modules'))) return null;
        return { path: resolved };
      });

      build.onLoad({ filter: /.*/, namespace: OVERRIDE }, (args) => {
        if (args.path === 'hook-override') {
          return {
            contents: hookOverride,
            loader: 'ts',
            resolveDir: path.dirname(REAL_HOOK),
          };
        }
        if (args.path === 'fakes-override') {
          return { contents: fakesOverride, loader: 'js', resolveDir: HERE };
        }
        return null;
      });
    },
  };
}

/** Bundle the suite (or a variant of it) and return the output path. */
async function bundle({
  entry = ENTRY,
  outfile = OUTFILE,
  hookOverride = null,
  fakesOverride = null,
} = {}) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
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
    plugins: [boundaryPlugin({ hookOverride, fakesOverride })],
    loader: { '.png': 'empty', '.ttf': 'empty', '.otf': 'empty' },
    jsx: 'automatic',
    logLevel: 'error',
  });
  return outfile;
}

/**
 * Bundle and run the suite in a child process.
 *
 * A child process keeps the suite's `process.exit` from ending the caller and
 * gives the mutation runner an exit code it can judge.
 */
async function runSuite(options = {}) {
  const outfile = await bundle(options);
  const result = spawnSync(process.execPath, [outfile], { cwd: ROOT, encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

if (require.main === module) {
  runSuite()
    .then((result) => {
      process.stdout.write(result.output);
      process.exit(result.status === null ? 1 : result.status);
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}

module.exports = { bundle, runSuite, ROOT, REAL_HOOK, REAL_FAKES, OUTFILE };
