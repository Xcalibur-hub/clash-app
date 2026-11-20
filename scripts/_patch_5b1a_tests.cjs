const fs = require('fs');
const path = require('path');

function applyReadHelper() {
  return `
function applyReadThroughMerge(
  store: ReturnType<typeof createArenaTranscriptStore>,
): (messageId: string, rows: ArenaReaction[] | null, snapshot: number) => boolean {
  return (messageId, rows, snapshot) => {
    let accepted = false;
    store.update((current) => {
      const existing = current.find((item) => item.id === messageId);
      if (!existing) return current;
      if (rows === null) {
        accepted = true;
        return current.filter((item) => item.id !== messageId);
      }
      const next = store.reactions.merge(
        current,
        [{ ...existing, reactions: rows }],
        snapshot,
      );
      const after = next.find((item) => item.id === messageId);
      accepted = !!after && after.reactions !== existing.reactions;
      return next;
    });
    return accepted;
  };
}
`;
}

// --- integration tests ---
{
  const file = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.integration.test.ts');
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('applyReadThroughMerge')) {
    s = s.replace(
      `function deferred<T = void>() {`,
      `${applyReadHelper().trim()}\n\nfunction deferred<T = void>() {`,
    );
  }
  s = s.replace(
    `const pending = queue.readAuthoritative({
        messageId,
        session: { ...live },
        isLiveSession,
        isLoaded: (id) => store.getSnapshot().some((item) => item.id === id),
      });`,
    `const pending = queue.readAuthoritative({
        messageId,
        session: { ...live },
        isLiveSession,
        isLoaded: (id) => store.getSnapshot().some((item) => item.id === id),
        snapshots: store.reactions,
        visibility: store.visibility,
        applyRead: applyReadThroughMerge(store),
      });`,
  );
  // Replace write-based bridge writes in R2 with merge applyRead on queue calls
  s = s.replace(
    /const pendingA = q\.readAuthoritative\(\{\n      messageId: 'm1', session, isLiveSession: \(\) => true,\n      isLoaded: \(\) => true,\n    \}\);/g,
    `const pendingA = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
      snapshots: store.reactions, visibility: store.visibility,
      applyRead: applyReadThroughMerge(store),
    });`,
  );
  s = s.replace(
    /const pendingB = q\.readAuthoritative\(\{\n      messageId: 'm1', session, isLiveSession: \(\) => true,\n      isLoaded: \(\) => true,\n    \}\);/g,
    `const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true,
      isLoaded: () => true,
      snapshots: store.reactions, visibility: store.visibility,
      applyRead: applyReadThroughMerge(store),
    });`,
  );
  s = s.replace(
    /const pendingA = q\.readAuthoritative\(\{\n      messageId: 'm1', session, isLiveSession: \(\) => true, isLoaded: \(\) => true,\n    \}\);/g,
    `const pendingA = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
      snapshots: store.reactions, visibility: store.visibility,
      applyRead: applyReadThroughMerge(store),
    });`,
  );
  s = s.replace(
    /const pendingB = q\.readAuthoritative\(\{\n      messageId: 'm1', session, isLiveSession: \(\) => true, isLoaded: \(\) => true,\n    \}\);/g,
    `const pendingB = q.readAuthoritative({
      messageId: 'm1', session, isLiveSession: () => true, isLoaded: () => true,
      snapshots: store.reactions, visibility: store.visibility,
      applyRead: applyReadThroughMerge(store),
    });`,
  );
  s = s.replace(
    `q.readAuthoritative({
        messageId: 'm1',
        session: { roomId: 'A', generation: 1 },
        isLiveSession: () => true,
        isLoaded: () => true,
      })`,
    `q.readAuthoritative({
        messageId: 'm1',
        session: { roomId: 'A', generation: 1 },
        isLiveSession: () => true,
        isLoaded: () => true,
        snapshots: store.reactions, visibility: store.visibility,
        applyRead: applyReadThroughMerge(store),
      })`,
  );
  s = s.replace(
    `const next = await q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
    });`,
    `const next = await q.readAuthoritative({
      messageId: 'm1',
      session: { roomId: 'A', generation: 1 },
      isLiveSession: () => true,
      isLoaded: () => true,
      snapshots: store.reactions, visibility: store.visibility,
      applyRead: applyReadThroughMerge(store),
    });`,
  );
  s = s.replace(
    `const pending = h.queue.readAuthoritative({
      messageId: 'm1',
      session: sessionA1,
      isLiveSession: h.isLiveSession,
      isLoaded: h.isLoaded,
    });`,
    `const pending = h.queue.readAuthoritative({
      messageId: 'm1',
      session: sessionA1,
      isLiveSession: h.isLiveSession,
      isLoaded: h.isLoaded,
      snapshots: h.store.reactions,
      visibility: h.store.visibility,
      applyRead: applyReadThroughMerge(h.store),
    });`,
  );
  // R2 first test still uses write-based path in createRoomReactionBridge — replace write with merge publisher for those queues
  fs.writeFileSync(file, s);
  console.log('integration patched');
}

// --- unit tests ---
{
  const file = path.join(__dirname, '..', 'utils', 'authoritativeReactionRead.test.ts');
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes("from './arenaTranscriptStore.ts'")) {
    s = s.replace(
      `import { createReactionSnapshots } from './reactionSnapshots.ts';`,
      `import { createReactionSnapshots } from './reactionSnapshots.ts';\nimport { createArenaTranscriptStore } from './arenaTranscriptStore.ts';\nimport { createVisibilityBarrier } from './transcriptOrdering.ts';`,
    );
  }
  // Add helper after fire()
  if (!s.includes('function mergeApply')) {
    s = s.replace(
      `function deferred<T = void>() {`,
      `function mergeApply(store: ReturnType<typeof createArenaTranscriptStore>) {
  return (messageId: string, rows: ArenaReaction[] | null, snapshot: number): boolean => {
    let accepted = false;
    store.update((current) => {
      const existing = current.find((item) => item.id === messageId);
      if (!existing) return current;
      if (rows === null) {
        accepted = true;
        return current.filter((item) => item.id !== messageId);
      }
      const next = store.reactions.merge(current, [{ ...existing, reactions: rows }], snapshot);
      accepted = next.find((item) => item.id === messageId)?.reactions !== existing.reactions;
      return next;
    });
    return accepted;
  };
}

function deferred<T = void>() {`,
    );
  }
  // Update harness read() calls - this is more involved. Rewrite harness return read.
  fs.writeFileSync(file, s);
  console.log('unit file base patched — rewriting harness via rewrite script');
}
