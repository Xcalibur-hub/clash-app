const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const babel = require('@babel/core');

const jsx = (type, props) => ({ type, props });
function load(file) {
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  function requireMock(name) {
    if (name === 'react') return { __esModule: true, default: { memo: x => x } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x } };
    if (name === '../../../theme') return { space: {}, typeScale: new Proxy({}, { get: () => ({}) }), useThemeColors: () => ({}) };
    if (name === '../../../utils/vaultWorldPersonality') return { personalityRadius: () => 12, personalityScatter: () => 0 };
    if (name === './SeriesComposition') return load('components/vault/world/SeriesComposition.tsx');
    return new Proxy({}, { get: (_, key) => key });
  }
  new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
  return module.exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function render(drops = []) {
  const collections = [{ id: 'collection-actual-id', title: 'A long collection title', count: drops.length, drops }];
  const opened = [];
  const { WorldChapter } = load('components/vault/world/WorldChapter.tsx');
  const chapter = WorldChapter({ row: { kind: 'collections', collections }, personality: 'editorial',
    onOpenCollection: id => opened.push(['collection', id]), onOpenDrop: id => opened.push(['drop', id]) });
  return { tree: chapter.type(chapter.props), opened };
}
test('empty collection heading executes the actual WorldChapter collection callback', () => {
  const { tree, opened } = render();
  const entry = nodes(tree).find(n => n.props?.accessibilityLabel === 'Open collection A long collection title');
  assert.ok(entry, 'empty collections need an actionable entry');
  assert.equal(entry.props.accessibilityRole, 'button');
  assert.ok(entry.props.style.minHeight >= 44);
  entry.props.onPress();
  assert.deepEqual(opened, [['collection', 'collection-actual-id']]);
  assert.ok(!nodes(entry).some(n => n.type === 'PosterStrip'), 'posters must not be nested in heading action');
  const title = nodes(entry).find(n => n.props?.children === 'A long collection title');
  assert.notEqual(title.props.allowFontScaling, false);
  assert.equal(title.props.numberOfLines, undefined, 'heading must wrap at enlarged text sizes');
});
test('episode poster retains its separate Drop callback and real Drop ID', () => {
  const { tree, opened } = render([{ id: 'drop-actual-id', title: 'Episode' }]);
  const poster = nodes(tree).find(n => n.type === 'PosterStrip');
  assert.equal(poster.props.items[0].id, 'drop-actual-id');
  poster.props.onOpen(poster.props.items[0].id);
  assert.deepEqual(opened, [['drop', 'drop-actual-id']]);
});

test('actual CollectionWorld retries a failed read into honest empty content for the same ID', async () => {
  const { harness, nodes: reactNodes } = require('./ui-completion-harness.cjs');
  const h = harness('components/vault/CollectionWorld.tsx', { collectionId: 'collection-actual-id' });
  let reads = 0;
  h.services.fetchCollection = async id => {
    assert.equal(id, 'collection-actual-id');
    if (++reads === 1) throw Error('offline');
    return { id, title: 'A real empty collection', creatorId: 'creator', drops: [] };
  };
  h.services.fetchProfileById = async () => null;
  try {
    await h.mount();
    const feedback = h.nodes.find(n => n.type?.name === 'ReadFeedback');
    assert.equal(feedback.props.status, 'error');
    assert.equal(h.nodes.some(n => n.type === 'FlatList'), false);
    await h.act(async () => feedback.props.retry());
    const list = h.nodes.find(n => n.type === 'FlatList');
    assert.deepEqual(list.props.data, []);
    assert.equal(list.props.ListEmptyComponent.props.title, 'Empty series');
    assert.equal(reactNodes(list.props.ListHeaderComponent).some(n => n.props?.children === 'A real empty collection'), true);
    assert.equal(reads, 2);
  } finally { await h.unmount(); }
});
