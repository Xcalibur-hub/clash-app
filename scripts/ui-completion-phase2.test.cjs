const test = require('node:test'), assert = require('node:assert/strict');
const { harness, deferred, nodes, text } = require('./ui-completion-harness.cjs');
const find = (tree, name) => nodes(tree).find(n => (n.type?.name ?? n.type) === name);
const lessons = [
  { id: 'locked', title: 'Locked lesson', position: 1, accessible: false, previewAllowed: false },
  { id: 'preview', title: 'A public preview', position: 2, accessible: false, previewAllowed: true },
];
function courseHarness(cards = lessons) {
  const h = harness('components/vault/CourseDetail.tsx', { courseId: 'c' });
  h.services.fetchCreatorCourse = async () => ({ id: 'c', creatorId: 'creator', accessType: 'subscriber', title: 'Course' });
  h.services.fetchProfileById = async () => null; h.services.fetchCourseLessonCards = async () => cards;
  h.services.fetchCourseProgress = async () => []; h.services.vaultCoverUrl = () => null;
  return h;
}

test('Course locked/preview/start actions reflect actual lesson accessibility', async () => {
  const h = courseHarness();
  try {
    await h.mount(); const list = find(h.tree, 'FlatList'), header = list.props.ListHeaderComponent;
    const locked = list.props.renderItem({ item: lessons[0] }); assert.equal(locked.props.disabled, true);
    await h.act(async () => locked.props.onPress()); assert.deepEqual(h.calls, []);
    const action = find(header, 'VaultActionButton'); assert.equal(action.props.label, 'View preview');
    await h.act(async () => action.props.onPress()); assert.deepEqual(h.calls, [['push', '/vault/course/c/lesson/preview']]);
  } finally { await h.unmount(); }
});
test('A fully locked course has no Start button; a permitted lesson can start', async () => {
  const locked = courseHarness(lessons.slice(0, 1));
  try { await locked.mount(); assert.equal(find(find(locked.tree, 'FlatList').props.ListHeaderComponent, 'VaultActionButton'), undefined); } finally { await locked.unmount(); }
  const open = courseHarness([{ ...lessons[0], accessible: true }]);
  try {
    await open.mount(); const action = find(find(open.tree, 'FlatList').props.ListHeaderComponent, 'VaultActionButton');
    assert.equal(action.props.label, 'Start course'); await open.act(async () => action.props.onPress()); assert.equal(open.calls[0][1], '/vault/course/c/lesson/locked');
  } finally { await open.unmount(); }
});
test('Empty course is unavailable, not a locked purchase opportunity; fetch failures retry', async () => {
  const h = courseHarness([]); let reads = 0;
  h.services.fetchCreatorCourse = async () => { if (++reads === 1) throw Error('offline'); return { id: 'c', creatorId: 'p', accessType: 'free' }; };
  try {
    await h.mount(); assert.equal(find(h.tree, 'ReadFeedback').props.status, 'error');
    await h.act(async () => find(h.tree, 'ReadFeedback').props.retry());
    const header = find(h.tree, 'FlatList').props.ListHeaderComponent;
    assert.equal(find(header, 'VaultAvailability').props.state, 'unavailable'); assert.equal(find(header, 'VaultActionButton'), undefined);
  } finally { await h.unmount(); }
});
test('Course and progress failures have independent retry; progress failure never means zero', async () => {
  const h = courseHarness(); let reads = 0;
  h.services.fetchCourseProgress = async () => { if (++reads === 1) throw Error('network'); return ['locked']; };
  try {
    await h.mount(); let header = find(h.tree, 'FlatList').props.ListHeaderComponent;
    const progress = find(header, 'ReadFeedback'); assert.equal(progress.props.status, 'error'); assert.doesNotMatch(text(header), /0 \/ 2/);
    await h.act(async () => progress.props.retry()); header = find(h.tree, 'FlatList').props.ListHeaderComponent;
    assert.match(text(header), /1\s*\/\s*2\s*lessons complete/); assert.equal(reads, 2);
  } finally { await h.unmount(); }
});

for (const kind of ['DropReader', 'LessonReader']) test(`${kind}: locked metadata cannot request private media or render protected body`, async () => {
  const props = kind === 'DropReader' ? { dropId: 'd' } : { courseId: 'c', lessonId: 'l' };
  const h = harness(`components/vault/${kind}.tsx`, props, undefined, { dependencies: { MediaViewer: { MediaViewer: 'MediaViewer' } } });
  let signs = 0, publicReads = 0;
  h.services.fetchDrop = async () => ({ id: 'd', creatorId: 'creator', accessible: false, accessLevel: 'subscriber', caption: 'Locked', previewMedia: null, collectionIds: [], publicMedia: { bucket: 'private', path: 'must-not-use' } });
  h.services.fetchCourseLessonCard = async () => ({ id: 'l', courseId: 'c', position: 1, accessible: false, accessType: 'subscriber', previewAllowed: false, hasPrivateMedia: true, bodyText: 'PROTECTED BODY', publicMedia: { bucket: 'private', path: 'must-not-use' } });
  h.services.fetchProfileById = async () => null;
  h.services.getPublicMediaUrl = () => { publicReads++; throw Error('No URL admitted'); };
  h.services.requestPrivateMediaAccess = h.services.requestLessonMediaAccess = async () => { signs++; throw Error('No signer admitted'); };
  try {
    await h.mount(); const media = find(h.tree, 'VaultReaderMedia'); assert.equal(await media.props.load(), null);
    assert.equal(signs, 0); assert.equal(publicReads, 0); assert.doesNotMatch(text(h.tree), /PROTECTED BODY/);
    assert.equal(find(h.tree, 'VaultAvailability').props.state, 'locked');
  } finally { await h.unmount(); }
});
test('Member Drop uses existing signer; a locked preview uses only its explicit public preview', async () => {
  const h = harness('components/vault/DropReader.tsx', { dropId: 'd' }, undefined, { dependencies: { MediaViewer: { MediaViewer: 'MediaViewer' } } });
  let accessible = true, signs = 0;
  h.services.fetchDrop = async () => ({ id: 'd', creatorId: 'p', accessible, accessLevel: 'subscriber', collectionIds: [], previewMedia: { bucket: 'public', path: 'preview', kind: 'image' } });
  h.services.fetchProfileById = async () => null;
  h.services.requestPrivateMediaAccess = async id => { signs++; assert.equal(id, 'd'); return { url: 'fixture://signed', mediaKind: 'video' }; };
  h.services.getPublicMediaUrl = (bucket, path) => { assert.equal(bucket, 'public'); assert.equal(path, 'preview'); return 'fixture://preview'; };
  try {
    await h.mount(); assert.deepEqual(await find(h.tree, 'VaultReaderMedia').props.load(), { url: 'fixture://signed', kind: 'video' }); assert.equal(signs, 1);
    accessible = false; h.auth = { user: { id: 'b' }, loading: false }; await h.update();
    assert.deepEqual(await find(h.tree, 'VaultReaderMedia').props.load(), { url: 'fixture://preview', kind: 'image' }); assert.equal(signs, 1);
  } finally { await h.unmount(); }
});
test('Lesson course identity mismatch is unavailable and has no media child', async () => {
  const h = harness('components/vault/LessonReader.tsx', { courseId: 'c', lessonId: 'l' }, undefined, { dependencies: { MediaViewer: { MediaViewer: 'MediaViewer' } } });
  h.services.fetchCourseLessonCard = async () => ({ id: 'l', courseId: 'other', accessible: true });
  try { await h.mount(); assert.equal(find(h.tree, 'ReadFeedback').props.status, 'missing'); assert.equal(find(h.tree, 'VaultReaderMedia'), undefined); } finally { await h.unmount(); }
});
test('Media failures are explicit/retryable and video opens the existing viewer only by user action', async () => {
  const gate = deferred(); let reads = 0;
  const load = () => { reads++; return reads === 1 ? gate.promise : Promise.resolve({ url: 'fixture://authorized', kind: 'video' }); };
  const h = harness('components/vault/VaultReaderMedia.tsx', { load, scope: 'a' }, undefined, { dependencies: { MediaViewer: { MediaViewer: 'MediaViewer' } } });
  try {
    await h.mount(); await h.act(async () => gate.reject(Error('transport secret')));
    assert.equal(find(h.tree, 'ReadFeedback').props.status, 'error');
    await h.act(async () => find(h.tree, 'ReadFeedback').props.retry());
    assert.equal(find(h.tree, 'MediaViewer'), undefined); await h.act(async () => find(h.tree, 'VaultActionButton').props.onPress());
    assert.equal(find(h.tree, 'MediaViewer').props.uri, 'fixture://authorized'); assert.equal(reads, 2);
    await h.act(async () => find(h.tree, 'MediaViewer').props.onClose()); assert.equal(find(h.tree, 'MediaViewer'), undefined);
  } finally { await h.unmount(); }
});
test('Media result after scope change is discarded and signer denial is not an empty result', async () => {
  const gate = deferred(), oldLoad = () => gate.promise, newLoad = async () => { throw { code: 'media_access_denied' }; };
  const h = harness('components/vault/VaultReaderMedia.tsx', { load: oldLoad, scope: 'a' }, undefined, { dependencies: { MediaViewer: { MediaViewer: 'MediaViewer' } } });
  try {
    await h.mount(); await h.update({ load: newLoad, scope: 'b' }); await h.act(async () => gate.resolve({ url: 'fixture://old-private', kind: 'image' }));
    assert.equal(find(h.tree, 'ReadFeedback').props.status, 'denied'); assert.equal(find(h.tree, 'Image'), undefined);
  } finally { await h.unmount(); }
});

test('Service read retry preserves normal request entry; request busy/error state preserves drafts and prevents duplicates', async () => {
  const detail = harness('components/vault/ServiceDetail.tsx', { serviceId: 's' }); let reads = 0;
  detail.services.fetchCreatorService = async () => { if (++reads === 1) throw Error('offline'); return { id: 's', creatorId: 'p', accessType: 'free', deliveryType: 'online' }; };
  detail.services.fetchProfileById = async () => null; detail.services.vaultCoverUrl = () => null;
  try { await detail.mount(); await detail.act(async () => find(detail.tree, 'ReadFeedback').props.retry()); assert.equal(find(detail.tree, 'ServiceRequest').props.serviceId, 's'); } finally { await detail.unmount(); }
  const h = harness('components/vault/ServiceRequest.tsx', { serviceId: 's' }), gate = deferred(); let writes = 0;
  h.services.requestCreatorService = async (id, message) => { assert.equal(id, 's'); assert.equal(message, 'A question'); writes++; if (writes === 1) return gate.promise; };
  try {
    await h.mount(); assert.equal(find(h.tree, 'VaultActionButton').props.disabled, true);
    await h.act(async () => find(h.tree, 'TextInput').props.onChangeText('A question'));
    const submit = find(h.tree, 'VaultActionButton').props.onPress;
    await h.act(async () => { submit(); submit(); }); assert.equal(writes, 1); assert.equal(find(h.tree, 'VaultActionButton').props.busy, true);
    await h.act(async () => gate.reject(Error('failure'))); assert.equal(find(h.tree, 'TextInput').props.value, 'A question');
    await h.act(async () => find(h.tree, 'VaultActionButton').props.onPress()); assert.equal(writes, 2); assert.equal(find(h.tree, 'TextInput').props.value, '');
    assert.match(text(h.tree), /No booking or payment/);
  } finally { await h.unmount(); }
});
test('Lesson completion cannot double-submit and exposes success only after acknowledgement', async () => {
  const h = harness('components/vault/LessonCompletion.tsx', { lessonId: 'l' }), gate = deferred(); let writes = 0;
  h.services.completeCourseLesson = async () => { writes++; return gate.promise; };
  try {
    await h.mount(); const submit = find(h.tree, 'VaultActionButton').props.onPress;
    await h.act(async () => { submit(); submit(); }); assert.equal(writes, 1); assert.equal(find(h.tree, 'VaultActionButton').props.busy, true);
    await h.act(async () => gate.resolve()); assert.equal(find(h.tree, 'VaultActionButton').props.label, 'Completed'); assert.equal(find(h.tree, 'VaultActionButton').props.disabled, true);
  } finally { await h.unmount(); }
});
