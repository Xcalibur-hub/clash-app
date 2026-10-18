const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  babel = require('@babel/core');
// Controlled UI/transport tests. All records below are local test fixtures, never production data.
const compile = file => babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  presets: ['@babel/preset-typescript', ['@babel/preset-react', {
    runtime: 'classic'
  }]],
  plugins: ['@babel/plugin-transform-modules-commonjs']
}).code;
const code = new Map();
function load(file, requireMock) {
  if (!code.has(file)) code.set(file, compile(file));
  const module = {
    exports: {}
  };
  vm.runInNewContext(code.get(file), {
    module,
    exports: module.exports,
    require: requireMock,
    setInterval: () => 1,
    clearInterval() {}
  });
  return module.exports;
}
const root = path.resolve(__dirname, '../..');
const discovery = load(path.join(root, 'utils/arenaClashDiscovery.ts'), () => {
  throw Error('Unexpected dependency');
});
const theme = {
  background: '#101014',
  surface: '#18181B',
  surfaceElevated: '#232329',
  border: '#393940',
  textPrimary: '#F4F1ED',
  textSecondary: '#C3BFC5',
  textMuted: '#96929B'
};
function harness(file, component, props = {}, signedIn = true, reduced = true) {
  let states = [],
    memos = [],
    si = 0,
    mi = 0,
    tree,
    effects = [],
    activeEffects = new Map();
  const auth = {
      signedIn,
      user: signedIn ? {
        id: 'a'
      } : null
    },
    calls = [],
    routes = [],
    keyboard = {};
  const React = {
    Fragment: 'Fragment',
    memo: fn => fn,
    createElement: (type, props, ...children) => ({
      type,
      props: {
        ...props,
        children
      }
    }),
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => {
        states[i] = typeof value === 'function' ? value(states[i]) : value;
      }];
    },
    useCallback(fn, deps) {
      const i = mi++;
      if (!memos[i] || deps.some((v, n) => v !== memos[i].deps[n])) memos[i] = {
        fn,
        deps
      };
      return memos[i].fn;
    },
    useEffect(fn, deps) {
      const callback = React.useCallback(fn, deps);
      effects.push(callback);
    }
  };
  const rpc = (kind, args) => new Promise((resolve, reject) => calls.push({
    kind,
    args,
    resolve,
    reject
  }));
  const rn = {
    StyleSheet: {
      create: x => x,
      hairlineWidth: 1,
      absoluteFill: {}
    },
    useWindowDimensions: () => ({
      width: 360,
      fontScale: 1
    }),
    Keyboard: {
      addListener: (event, fn) => {
        keyboard[event] = fn;
        return {
          remove: () => delete keyboard[event]
        };
      }
    },
    ...Object.fromEntries(['Pressable', 'ScrollView', 'FlatList', 'Text', 'View', 'Image'].map(x => [x, x]))
  };
  const animation = {
    duration() {
      return this;
    },
    delay() {
      return this;
    }
  };
  const primitiveButton = ({ label, accessibilityLabel, onPress, disabled }) => React.createElement('Pressable', { accessibilityLabel: accessibilityLabel ?? label, onPress, disabled }, label);
  let pureCard;
  const requireMock = name => {
    if (name === './LiveDuelCard') return { LiveDuelCard: pureCard ??= load(path.join(root, 'components/arena/LiveDuelCard.tsx'), requireMock).LiveDuelCard };
    if (name.endsWith('/ui/ArenaPrimitives')) return { ArenaButton: primitiveButton };
    if (name.endsWith('/theme/arena')) return { arena: { type: { statement: {}, heading: {}, body: {}, meta: {}, eyebrow: {}, label: {} } }, arenaColors: t => ({ surface: t.surface, line: t.border, ink: t.textPrimary, muted: t.textMuted }) };

    if (name === "../../utils/topicConstellation") return load(path.join(root, "utils/topicConstellation.ts"), () => { throw Error("Unexpected graph dependency"); });
    if (name === "./TakeFeedCard") return load(path.join(root, "components/arena/TakeFeedCard.tsx"), requireMock);
    if (name === '../../hooks/useClock') return { useClock: () => Date.now() };
    if (name === '../../utils/takeDetail') return load(path.join(root, 'utils/takeDetail.ts'), () => { throw Error('Unexpected Take helper dependency'); });
    if (name === 'react') return React;
    if (name === 'react-native') return rn;
    if (name === 'expo-router') return {
      useRouter: () => ({
        push: route => routes.push(route)
      }),
      useFocusEffect: fn => effects.push(fn)
    };
    if (name === 'react-native-reanimated') return {
      __esModule: true,
      default: {
        View: 'Animated.View',
        Text: 'Animated.Text'
      },
      FadeIn: animation,
      FadeInDown: animation,
      useReducedMotion: () => reduced
    };
    if (name === 'react-native-svg') return {
      __esModule: true,
      default: 'Svg',
      Line: 'Line'
    };
    if (name === 'react-native-safe-area-context') return {
      useSafeAreaInsets: () => ({
        bottom: 24
      })
    };
    if (name.endsWith('/theme')) return {
      layout: {
        screenX: 20
      },
      radius: {
        pill: 99
      },
      useThemeColors: () => theme
    };
    if (name.endsWith('/AuthProvider')) return {
      useAuth: () => auth
    };
    if (name.endsWith('/NotificationUnreadProvider')) return {
      useNotificationUnread: () => ({
        unread: 2
      })
    };
    if (name.endsWith('/arenaInterestService')) return {
      fetchInterestCatalogue: () => rpc('catalogue')
    };
    if (name.endsWith('/liveArenaService')) return {
      fetchLiveTopics: () => rpc('topics')
    };
    if (name.endsWith('/arenaTrendService')) return {
      fetchTrendingBattles: (...args) => rpc('trends', args)
    };
    if (name.endsWith('/arenaClashDiscoveryService')) return {
      fetchClashDiscovery: () => rpc('discovery')
    };
    if (name.endsWith('/clashEngineService')) return {
      fetchClashView: id => rpc('preview', id)
    };
    if (name.endsWith('/arenaClashDiscovery')) return discovery;
    if (name.endsWith('/haptics')) return {
      press() {},
      tap() {}
    };
    if (name.endsWith('/Avatar')) return {
      Avatar: 'Avatar'
    };
    if (name === './ArenaQuestions') return {
      ArenaQuestions: 'ArenaQuestions'
    };
    if (name.endsWith('/icons')) return new Proxy({}, {
      get: (_, key) => String(key)
    });
    if (name.endsWith('/hoods')) return {
      HOOD_LABEL: {
        tech: 'Tech'
      }
    };
    if (name.endsWith('/format')) return {
      compact: String,
      timeAgo: () => '2m'
    };
    if (name.endsWith('/mediaStill')) return {
      resolveStillUrl: media => media.url
    };
    if (name.endsWith('/takePulse')) return {
      takePulse: () => null,
      pulseLabel: String
    };
    if (name === './TakeActionRow') return {
      TakeActionRow: 'TakeActionRow'
    };
    if (name === './TakeChallenges') return {
      ChallengeTakeButton: 'ChallengeTakeButton'
    };
    if (name === './TakeStoryBeat') return {
      TakeStoryBeat: 'TakeStoryBeat'
    };
    if (name === './QuestionVotePanel') return {
      QuestionVotePanel: 'QuestionVotePanel'
    };
    if (name === './dockConfig') return {
      ARENA_TABS: {
        index: {
          label: 'Home',
          icon: 'HomeIcon'
        }
      },
      VAULT_TABS: {
        index: {
          label: 'Vault',
          icon: 'VaultIcon'
        }
      }
    };
    throw Error('Unexpected dependency: ' + name);
  };
  const exports = load(path.join(root, file), requireMock);
  let renderComponent = exports[component];
  const render = () => {
    si = 0;
    mi = 0;
    effects = [];
    tree = renderComponent(props);
    function expand(node) {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map(expand);
      if (node.type === primitiveButton || node.type === pureCard) return expand(node.type(node.props));
      if (node.type === 'FlatList') node.props.children = [node.props.ListHeaderComponent, ...node.props.data.map((item,index) => node.props.renderItem({item,index})), !node.props.data.length && node.props.ListEmptyComponent];
      if (node.props?.children) node.props.children = expand(node.props.children);
      return node;
    }
    tree = expand(tree);
    if (typeof tree?.type === "function" && file.endsWith("TakeFeedItem.tsx")) tree = tree.type(tree.props);
    effects.forEach((effect, index) => {
      if (activeEffects.get(index)?.effect !== effect) {
        activeEffects.get(index)?.cleanup?.();
        activeEffects.set(index, {
          effect,
          cleanup: effect()
        });
      }
    });
    return tree;
  };
  const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
  const walkText = node => node == null ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(walkText).join(' ') : walkText(node.props?.children);
  const nodes = () => walk(tree);
  const text = (node = tree) => walkText(node).replace(/\s+/g, ' ').trim();
  const press = label => {
    const button = nodes().find(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || text(n).trim() === label));
    assert.ok(button, 'Missing control: ' + label + '; available: ' + nodes().filter(n => n.type === 'Pressable').map(n => n.props.accessibilityLabel).join(' | '));
    button.props.onPress();
    render();
  };
  const blur = () => {
    activeEffects.forEach(item => item.cleanup?.());
    activeEffects.clear();
  };
  render();
  return {
    exports,
    auth,
    calls,
    routes,
    keyboard,
    props,
    render,
    nodes,
    text,
    press,
    blur,
    settle: async () => {
      await new Promise(setImmediate);
      render();
    },
    mountChild(type, nextProps) {
      blur();
      states = [];
      memos = [];
      renderComponent = type;
      props = nextProps;
      render();
    }
  };
}
const topicProps = {
  onOpenTopic() {},
  onOpenRoom() {}
};
const interests = [{
  id: 'film',
  name: 'Film',
  description: 'Film discussion',
  hoods: ['movies']
}, {
  id: 'screen',
  name: 'Screen',
  description: 'Screen culture',
  hoods: ['movies']
}];
const entry = {
  id: 'duel',
  takeId: 'take',
  roomId: 'room',
  title: 'Test proposition',
  state: 'LIVE',
  status: 'open',
  kind: 'CLASH'
};
const tickTopics = async h => {
  h.calls.find(c => c.kind === 'catalogue')?.resolve(interests);
  h.calls.find(c => c.kind === 'topics').resolve([]);
  h.calls.find(c => c.kind === 'trends').resolve([]);
  await h.settle();
};
test('constellation edges only represent real shared communities and fit narrow/large-font layouts', () => {
  const h = harness('components/arena/ArenaTopics.tsx', 'ArenaTopics', topicProps);
  for (const [width, scale] of [[280, 1], [320, 1], [320, 2]]) {
    const nodes = Array.from({
      length: 20
    }, (_, i) => ({
      id: String(i),
      label: 'Topic ' + i,
      hoods: i < 2 ? ['shared'] : []
    }));
    const graph = h.exports.constellationLayout(nodes, width, scale);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].join(','), '0,1');
    graph.points.forEach(p => {
      assert.ok(p.x > 0 && p.x < width);
      assert.ok(p.y + 100 < graph.height);
    });
    graph.points.forEach((a, i) => graph.points.slice(i + 1).forEach(b => assert.ok(Math.abs(a.x - b.x) >= graph.cell - 1 || Math.abs(a.y - b.y) >= 100 * scale)));
  }
  h.blur();
});
test('topic selection preserves community and question-filter actions', async () => {
  const h = harness('components/arena/ArenaTopics.tsx', 'ArenaTopics', topicProps);
  await tickTopics(h);
  h.press('Explore Film');
  h.press('Explore movies ↗');
  assert.equal(h.routes.at(-1), '/hood/movies');
  h.press('Questions about Film ↓');
  assert.equal(h.nodes().find(n => n.type === 'ArenaQuestions').props.topicId, 'film');
  assert.equal(h.nodes().find(n => n.type === 'Animated.View').props.entering, undefined);
  h.press('All questions');
  assert.equal(h.nodes().find(n => n.type === 'ArenaQuestions').props.topicId, undefined);
  h.blur();
});
test('trends are server-only nodes, preserve Room destinations and never become a ranked list', async () => {
  let opened;
  const h = harness('components/arena/ArenaTopics.tsx', 'ArenaTopics', {
    ...topicProps,
    onOpenRoom: id => opened = id
  });
  assert.deepEqual(h.calls.find(c => c.kind === 'trends').args, [10, true]);
  h.calls[0].resolve([]);
  h.calls[1].resolve([]);
  h.calls[2].resolve([{
    topicId: 't',
    title: 'Real trend',
    hood: null,
    topicStatus: 'live',
    participantCount: 3,
    hotRoomId: 'r'
  }]);
  await h.settle();
  h.press('Trending now');
  h.press('Explore Real trend');
  h.press('Open conversation ↗');
  assert.equal(opened, 'r');
  assert.doesNotMatch(h.text(), /#1|Top 10/);
  h.blur();
});
test('graph failures offer retry, never fabricate emptiness', async () => {
  const h = harness('components/arena/ArenaTopics.tsx', 'ArenaTopics', topicProps);
  h.calls.forEach(c => c.reject(Error('offline')));
  await h.settle();
  assert.match(h.text(), /Couldn't load this map/);
  assert.doesNotMatch(h.text(), /No topics available|No active discussions/);
  h.press('Try again');
  assert.equal(h.calls.length, 6);
  h.blur();
});
test('late graph responses are discarded on account changes and blur', async () => {
  const h = harness('components/arena/ArenaTopics.tsx', 'ArenaTopics', topicProps);
  const old = [...h.calls];
  h.auth.user = {
    id: 'b'
  };
  h.render();
  old[0].resolve(interests);
  old[1].resolve([]);
  old[2].resolve([]);
  await h.settle();
  assert.doesNotMatch(h.text(), /Film/);
  h.blur();
  h.calls.slice(3).forEach(c => c.resolve(interests));
  await h.settle();
  assert.doesNotMatch(h.text(), /Film/);
  h.blur();
});
test('guest Live discovery is a sign-in gate, not a fabricated zero', () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', {
    topics: [],
    topicsError: true
  }, false);
  assert.equal(h.calls.length, 0);
  assert.match(h.text(), /Sign in to discover/);
  h.press('Topic rooms');
  assert.match(h.text(), /load discussions/);
  assert.doesNotMatch(h.text(), /0 live|No live Clashes|No topic rooms/);
  h.blur();
});
test('Live failure and successful empty response are distinct', async () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', {
    topics: [],
    topicsLoading: true
  });
  h.calls[0].reject(Error('offline'));
  await h.settle();
  assert.match(h.text(), /load Clashes/);
  assert.doesNotMatch(h.text(), /No live Clashes|No topic rooms/);
  h.press('Try again');
  h.calls[1].resolve([]);
  await h.settle();
  assert.match(h.text(), /No live Clashes right now/);
  h.blur();
});
test('pending, upcoming and cancelled records retain their authoritative state and routes', async () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', {
    topics: []
  });
  h.calls[0].resolve([{
    ...entry,
    id: 'p',
    state: 'PENDING',
    status: 'PENDING',
    kind: 'CHALLENGE',
    roomId: null
  }, {
    ...entry,
    id: 'u',
    state: 'UPCOMING'
  }, {
    ...entry,
    id: 'c',
    state: 'COMPLETED',
    status: 'cancelled',
    roomId: null
  }]);
  await h.settle();
  assert.doesNotMatch(h.text(), /Awaiting acceptance|cancelled|UPCOMING/);
  h.press('Open Challenge Inbox'); assert.equal(h.routes.at(-1), '/arena/challenges');
  h.press('Open Clash history');
  h.press('Open Hall of Fame archive'); assert.equal(h.routes.at(-1), '/arena/hall-of-fame');
  const cancelled = h.nodes().find(n => typeof n.type === 'function'); assert.ok(cancelled);
  assert.equal(discovery.clashDiscoveryDestination({ ...entry, kind: 'CHALLENGE', roomId: null }), '/take/take');
  assert.equal(discovery.clashDiscoveryDestination({ ...entry, roomId: null }), '/clash/take');
  h.press('Coming up');
  const scheduled = h.nodes().find(n => typeof n.type === 'function'); assert.ok(scheduled);
  h.mountChild(scheduled.type, scheduled.props); h.press('View Clash. UPCOMING. Test proposition');
  assert.equal(h.routes.at(-1), '/arena/room/room');
  h.mountChild(cancelled.type, cancelled.props); h.press('View Clash. CANCELLED. Test proposition');
  assert.equal(h.routes.at(-1), '/clash/take');
  h.blur();
});
test('fighter preview respects BLIND identity, ended status and account isolation', async () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', {
    topics: []
  });
  h.calls[0].resolve([entry]);
  await h.settle();
  const card = h.nodes().find(n => typeof n.type === 'function');
  assert.ok(card);
  h.mountChild(card.type, card.props);
  const view = {
    clashId: 'duel',
    roomId: 'room',
    mode: 'BLIND',
    status: 'settled',
    revealed: false,
    sideA: {
      name: 'Secret A'
    },
    sideB: {
      name: 'Secret B'
    }
  };
  h.calls.at(-1).resolve(view);
  await h.settle();
  assert.match(h.text(), /Identity hidden/);
  assert.doesNotMatch(h.text(), /Secret|LIVE/);
  assert.doesNotMatch(h.text(), /On the stage/);
  assert.match(h.text(), /View result/);
  h.auth.user = {
    id: 'b'
  };
  h.render();
  assert.doesNotMatch(h.text(), /SETTLED|Secret/);
  h.blur();
});
test('fighter preview reveals only authorized server identities and keeps canonical navigation', async () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', {
    topics: []
  });
  h.calls[0].resolve([entry]);
  await h.settle();
  const card = h.nodes().find(n => typeof n.type === 'function');
  h.mountChild(card.type, card.props);
  h.calls.at(-1).resolve({
    clashId: 'duel',
    roomId: 'room',
    mode: 'STANDARD',
    status: 'open',
    revealed: true,
    sideA: {
      name: 'Allowed A',
      tint: 'red'
    },
    sideB: {
      name: 'Allowed B',
      tint: 'blue'
    }
  });
  await h.settle();
  assert.match(h.text(), /Allowed A/);
  assert.match(h.text(), /Allowed B/);
  h.press('Watch Duel. LIVE. Test proposition');
  assert.equal(h.routes.at(-1), '/arena/room/room');
  h.blur();
});
test('editorial feed retains actions, questions and challenge gate without claiming active Clashes', () => {
  const events = [],
    take = {
      id: 't',
      text: 'Test Take',
      expiresAt: Date.now() + 3600000,
      hood: 'tech',
      clashes: 2,
      reactions: 4,
      createdAt: 0,
      question: {
        A: 'a',
        B: 'b'
      }
    };
  const h = harness('components/arena/TakeFeedItem.tsx', 'TakeFeedItem', {
    take,
    author: {
      id: 'a',
      name: 'Fixture',
      handle: 'fixture'
    },
    isViewer: false,
    isSaved: true,
    hasReacted: true,
    commentCount: 3,
    onReact: () => events.push('react'),
    onShare: () => events.push('share'),
    onSave: () => events.push('save'),
    onOpenClash: () => events.push('clash'),
    onOpenDetail: () => events.push('detail'),
    onMore: () => events.push('more')
  });
  assert.doesNotMatch(h.text(), /ACTIVE|in the fight/);
  assert.match(h.text(), /2 Clashes/);
  for (const label of ['React to this take', 'Open rebuttals', 'Clash on this take', 'Share this take', 'Remove from saved', 'More take actions']) h.press(label);
  assert.equal(h.nodes().find(n => n.props.accessibilityLabel === 'Remove from saved').props.accessibilityState.selected, true);
  assert.deepEqual(events, ['react', 'detail', 'clash', 'share', 'save', 'more']);
  assert.ok(h.nodes().some(n => n.type === 'QuestionVotePanel'));
  assert.ok(h.nodes().some(n => n.type === 'ChallengeTakeButton'));
  assert.equal(h.nodes()[0].props.entering, undefined);
  h.blur();
});
test('failed media preview has an honest fallback and retains detail entry', () => {
  let opened = false;
  const h = harness('components/arena/TakeFeedItem.tsx', 'TakeFeedItem', {
    take: {
      id: 't',
      text: 'Media',
      hood: 'tech',
      clashes: 0,
      media: {
        kind: 'video',
        url: 'test-only://video'
      }
    },
    author: {
      id: 'a',
      name: 'Fixture'
    },
    isViewer: true,
    onOpenDetail: () => opened = true
  });
  h.nodes().find(n => n.type === 'Image').props.onError();
  h.render();
  assert.match(h.text(), /Preview unavailable/);
  h.press('Open take: Media');
  assert.equal(opened, true);
  assert.ok(!h.nodes().some(n => n.type === 'ChallengeTakeButton'));
  h.blur();
});
test('Arena dock hides for keyboard, restores safe inset, cleans listeners; Vault behavior unchanged', () => {
  const props = {
    state: {
      routes: [{
        key: 'home',
        name: 'index'
      }],
      index: 0
    },
    realm: 'arena',
    ShiftIcon: 'ShiftIcon',
    shiftLabel: 'Vault',
    navigation: {},
    onShiftRealm() {}
  };
  const h = harness('components/navigation/RealmTabBar.tsx', 'RealmTabBar', props);
  assert.ok(h.keyboard.keyboardDidShow);
  h.keyboard.keyboardDidShow();
  h.render();
  assert.equal(h.nodes().length, 1);
  h.keyboard.keyboardDidHide();
  h.render();
  assert.equal(h.nodes()[0].props.style.at(-1).paddingBottom, 24);
  h.blur();
  assert.equal(Object.keys(h.keyboard).length, 0);
  const vault = harness('components/navigation/RealmTabBar.tsx', 'RealmTabBar', {
    ...props,
    realm: 'vault'
  });
  assert.equal(Object.keys(vault.keyboard).length, 0);
  assert.match(vault.nodes()[0].props.style[0].paddingHorizontal.toString(), /40/);
  vault.blur();
});
test('denied or mismatched preview removes stale metadata rather than displaying a known-ID card', async () => {
  for (const response of [null, { clashId: 'other', roomId: 'room', revealed: true, sideA: { name: 'Hidden' } }]) {
    const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', { topics: [] });
    h.calls[0].resolve([entry]); await h.settle();
    const card = h.nodes().find(n => typeof n.type === 'function'); h.mountChild(card.type, card.props);
    h.calls.at(-1).resolve(response); await h.settle();
    assert.match(h.text(), /no longer available/); assert.doesNotMatch(h.text(), /Test proposition|Hidden/);
    assert.equal(h.nodes().filter(n => n.type === 'Pressable').length, 0); h.blur();
  }
});
test('discovery virtualizes preview reads and supports identities beyond the first eight without creating membership', async () => {
  const h = harness('components/arena/ArenaClashes.tsx', 'ArenaClashes', { topics: [] });
  h.calls[0].resolve(Array.from({ length: 12 }, (_, i) => ({ ...entry, id: 'duel-' + i }))); await h.settle();
  const cards = h.nodes().filter(n => typeof n.type === 'function');
  assert.equal(cards.length, 12); assert.equal(cards.filter(c => c.props.loadIdentity).length, 12);
  const list = h.nodes().find(n => n.type === 'FlatList');
  assert.equal(list.props.initialNumToRender, 4); assert.equal(list.props.maxToRenderPerBatch, 6); assert.equal(list.props.windowSize, 5);
  assert.equal(h.calls.length, 1, 'Discovery alone must not eagerly hydrate every card');
  h.mountChild(cards[11].type, cards[11].props); assert.equal(h.calls.length, 2);
  assert.equal(h.calls.at(-1).kind, 'preview'); assert.equal(h.calls.at(-1).args, 'duel-11'); h.blur();
});
test('Home gateway distinguishes topic counts from Room or viewer totals and leaves unknown counts unlabeled', () => {
  for (const count of [null, 0, 1, 3]) {
    const h = harness('components/arena/ArenaLiveGateway.tsx', 'ArenaLiveGateway', { liveCount: count, onOpen() {} });
    assert.doesNotMatch(h.text(), /viewers|rooms|0 live/);
    if (count > 0) assert.match(h.text(), new RegExp(count + ' live discussion'));
    h.blur();
  }
});
