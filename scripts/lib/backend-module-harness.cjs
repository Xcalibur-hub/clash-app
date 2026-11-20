const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { transform } = require('sucrase');
function moduleHarness(origin, rows = []) {
  const env = { EXPO_PUBLIC_SUPABASE_URL: origin };
  const values = new Map(rows), reads = [], writes = [], removals = [], modules = new Map();
  const storage = {
    getItem: async name => { reads.push(name); return values.get(name) ?? null; },
    setItem: async (name, value) => { writes.push(name); values.set(name, value); },
    removeItem: async name => { removals.push(name); values.delete(name); },
  };
  function load(relative, overrides = {}) {
    const file = path.resolve(relative);
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const source = fs.readFileSync(file, 'utf8');
    const context = { exports, process: { env }, URL, Buffer, console,
      require: name => {
        if (name in overrides) return overrides[name];
        if (name === '@react-native-async-storage/async-storage') return storage;
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), overrides);
        throw Error('Unexpected dependency: ' + name);
      } };
    vm.runInNewContext(transform(source, { transforms: ['typescript', 'imports'] }).code, context, { filename: file });
    return exports;
  }
  return { env, values, reads, writes, removals, storage, load };
}
module.exports = { moduleHarness };
