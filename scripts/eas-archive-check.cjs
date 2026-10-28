/* Offline inventory only: installed EAS copy filter, no CLI context/Auth, copy or upload. */
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const ts = require('typescript');
async function inspectArchive() {
  const root = process.cwd();
  const cliRoot = process.env.EAS_CLI_ROOT || path.join(os.homedir(), 'AppData/Roaming/npm/node_modules/eas-cli');
  const { Ignore } = require(path.join(cliRoot, 'build/vcs/local.js'));
  const version = JSON.parse(await fs.readFile(path.join(cliRoot, 'package.json'))).version;
  const ignore = await Ignore.createForCopyingAsync(root);
  const included = [];
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name), relative = path.relative(root, full);
      // Same root-relative predicate as EAS makeShallowCopyAsync, including directories.
      if (ignore.ignores(relative)) continue;
      assert.ok(!entry.isSymbolicLink(), 'Included symlink requires explicit ownership review');
      if (entry.isDirectory()) await walk(full);
      else included.push(relative.replaceAll('\\', '/'));
    }
  }
  await walk(root); included.sort(); const set = new Set(included);
  const required = ['app.json', 'app.config.ts', 'eas.json', 'package.json', 'package-lock.json', 'tsconfig.json',
    'metro.config.js', 'babel.config.js', 'config/release-targets.json', 'scripts/arena-demo-resolver.cjs',
    'app/_layout.tsx', 'components/liveArena/ArenaRoomText.tsx', 'utils/publicMediaImageSource.ts',
    'supabase/database.types.ts', 'data/exploreWorldGeometry.json'];
  for (const item of required) assert.ok(set.has(item), 'Missing required archive input: ' + item);
  const denied = ['.expo/phase5d2/recover.cjs', 'docs/evidence/private.png', '.env', '.env.local', '.env.example',
    'services/.env', 'config/credentials.json', 'android/app/debug.keystore', 'app/private.dpapi.json',
    'app/signing.key', 'app/signing.pem', 'archive.zip', 'index.html', 'build-agency.js', 'sybil/photo.png',
    'app/private-note.txt', 'app/unreviewed-screen.tsx', 'components/unreviewed-image.png',
    '.expo/ui-completion-phase4c/fictional-a.dpapi.json', 'docs/evidence/release-readiness/PHASE_6D1_ENV_ARCHIVE_REPORT.md'];
  for (const item of denied) assert.ok(ignore.ignores(item), 'Private path not ignored');
  const untracked = cp.execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  const authorizedNewInputs = new Set(['.easignore', 'config/release-targets.json']);
  const unexpected = untracked.filter(file => set.has(file) && !authorizedNewInputs.has(file));
  assert.equal(unexpected.length, 0, 'Unreviewed untracked files entered archive inventory');
  // Resolve every static relative dependency of included runtime/config sources.
  // Non-relative packages are supplied by the included dependency manifest/lockfile.
  let localDependencies = 0, assets = 0, lockedPackageReferences = 0;
  const packages = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'))).packages;
  for (const file of included.filter(f => /\.[cm]?[jt]sx?$/.test(f))) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    for (const item of ts.preProcessFile(source, true, true).importedFiles) {
      if (!item.fileName.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(item.fileName, path.join(root, file), {
        moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true,
      }, ts.sys).resolvedModule?.resolvedFileName;
      const raw = path.resolve(root, path.dirname(file), item.fileName);
      const candidate = resolved || (ts.sys.fileExists(raw) ? raw : null);
      assert.ok(candidate, 'Unresolved local archive dependency: ' + file);
      const relative = path.relative(root, candidate).replaceAll('\\', '/');
      if (relative.startsWith('node_modules/')) {
        const packagePath = relative.match(/^node_modules\/(?:@[^/]+\/)?[^/]+/)[0];
        assert.ok(packages[packagePath], 'Unlocked package dependency');
        lockedPackageReferences++; continue;
      }
      assert.ok(set.has(relative), 'Excluded local dependency: ' + relative);
      localDependencies++;
      if (!/\.[cm]?[jt]sx?$/.test(relative)) assets++;
    }
  }
  // Private files are only path-tested, never opened or copied.
  return { status: 'PASS', easCliVersion: version, method: 'Ignore.createForCopyingAsync + identical recursive copy filter; inventory only',
    files: included.length, inventorySha256: crypto.createHash('sha256').update(included.join('\n')).digest('hex'),
    requiredInputs: required.length, privatePathAssertions: denied.length, localDependencies, assetImports: assets, lockedPackageReferences,
    untrackedFilesChecked: untracked.length, untrackedFilesExcluded: untracked.filter(file => !set.has(file)).length,
    includedNewPaths: untracked.filter(file => set.has(file)), networkRequests: 0, copiedFiles: 0 };
}
module.exports = { inspectArchive };
if (require.main === module) inspectArchive().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED', reason: error.code === 'MODULE_NOT_FOUND' ? 'Installed EAS inventory API unavailable' : error.message }));
  process.exitCode = 1;
});
