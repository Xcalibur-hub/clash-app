import React from 'react';
import { BackHandler, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PresentationThemeProvider } from '../../../theme/ThemeProvider';
import { useThemeColors } from '../../../theme';
import { arena, arenaColors } from '../../../theme/arena';
import { TakeFeedCard } from '../../arena/TakeFeedCard';
import { TakeEditorialHeader } from '../../arena/TakeEditorialHeader';
import { TakeActionRow } from '../../arena/TakeActionRow';
import { ArenaReplySort } from '../../arena/ui/ArenaReplySort';
import { ArenaBadge, ArenaButton, ArenaIdentity, ArenaSectionHeading, ArenaSurface } from '../../arena/ui/ArenaPrimitives';
import { GroupCard } from '../../arena/groups/GroupIdentity';
import { duelPresentation } from '../../../utils/duelPresentation';
import { DuelRoomOutcome } from '../../liveArena/DuelRoomOutcome';
import { ImmersiveClash } from '../../liveArena/ImmersiveClash';
import type { ArenaMessage } from '../../../services/liveArenaService';
import type { CrowdModel } from '../../liveArena/LiveCrowdLayer';
import { takeChallengeIneligibility } from '../../../utils/takeChallengeEligibility';
import { validCrowdText } from '../../../utils/arenaCrowd';
import { DemoMedia } from './DemoMedia';
import { useKeyboardVisible } from '../../../hooks/useKeyboardVisible';
import { DemoLiveDiscovery } from './DemoLiveDiscovery';
import { DemoChallenge } from './DemoChallenge';
import { DemoConstellation, DemoForm, DemoSheet, DemoText, DemoThread } from './DemoParts';
import { createDemoState, demoDuel, demoReducer, visibleDemoAssists, type DemoAction, type DemoMediaKind, type DemoState, type DemoTake, type Page, type Phase, type Role } from './model';

type Dispatch = React.Dispatch<DemoAction>;
type Sheet = { kind: 'reply' | 'challenge' | 'history'; id: string; parentId?: string } | { kind: 'assists' | 'arguments' | 'scenarios' } | { kind: 'media'; media: DemoMediaKind };
const tabs = ['home', 'live', 'groups', 'discover'] as const;
const titles = { home: 'Home', live: 'Live', groups: 'Groups', discover: 'Discover' };
export interface DemoArenaProps { onExit: () => void; initialPage?: Page; initialTheme?: 'dark' | 'light' }

export function DemoArena({ onExit, initialPage, initialTheme }: DemoArenaProps): React.JSX.Element {
  const [state, dispatch] = React.useReducer(demoReducer, undefined, () => ({ ...createDemoState(), page: initialPage ?? { kind: 'home' as const }, theme: initialTheme ?? 'dark' }));
  return <PresentationThemeProvider scheme={state.theme}><DemoSurface state={state} dispatch={dispatch} onExit={onExit} /></PresentationThemeProvider>;
}

function DemoSurface({ state: s, dispatch, onExit }: { state: DemoState; dispatch: Dispatch; onExit: () => void }): React.JSX.Element {
  const c = arenaColors(useThemeColors()), insets = useSafeAreaInsets();
  // The fixed header owns the top of the content area. Fall back to the status
  // bar height when the provider reports a zero/stale inset during the first
  // layout (edge-to-edge), so Back / Light / Exit can never sit under the
  // status bar or a window-level overlay.
  const topInset = Math.max(insets.top, RNStatusBar.currentHeight ?? 0);
  const keyboardOpen = useKeyboardVisible();
  const [sheet, setSheet] = React.useState<Sheet>(), [status, setStatus] = React.useState<'populated' | 'empty' | 'loading' | 'error'>('populated');
  const back = React.useCallback(() => { setSheet(undefined); if (s.history.length || s.page.kind !== 'home') dispatch({ type: 'back' }); else onExit(); }, [dispatch, onExit, s.history.length, s.page.kind]);
  React.useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (sheet) setSheet(undefined); else back(); return true; }); return () => sub.remove(); }, [back, sheet]);
  const navigate = (page: Page, tab = false) => { setSheet(undefined); setStatus('populated'); dispatch({ type: 'navigate', page, tab }); };
  const notice = (text: string) => dispatch({ type: 'notice', text });
  const openRoom = (id: string, phase: Phase = 'OPEN') => { setSheet(undefined); dispatch({ type: 'open-room', id, phase }); };
  const item = s.data.takes.find(item => item.take.id === s.page.id) ?? s.data.takes[0];
  const showTabs = tabs.some(tab => tab === s.page.kind);
  return <View style={{ flex: 1, backgroundColor: c.page }} accessibilityLabel="Demo Arena. Fictional content and local interactions only.">
    <StatusBar style={s.theme === 'dark' ? 'light' : 'dark'} />
    <View style={{ paddingTop: topInset, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: c.strongLine, backgroundColor: c.surface }}>
      <View style={styles.row}>
        {s.history.length || !showTabs ? <ArenaButton label="Back" variant="tertiary" onPress={back} /> : null}
        <Text numberOfLines={1} accessibilityRole="header" style={[arena.type.label, { color: c.ink, flex: 1, minWidth: 40, marginHorizontal: 8 }]}>{showTabs ? 'Demo Arena' : 'Demo'}</Text>
        <ArenaButton label={s.theme === 'dark' ? 'Light' : 'Dark'} variant="tertiary" onPress={() => dispatch({ type: 'theme' })} />
        <ArenaButton label="Exit demo" variant="tertiary" onPress={onExit} />
      </View>
      <Text numberOfLines={1} accessibilityLabel="Fictional people, counts and results. Local actions only." style={[arena.type.meta, { color: c.secondary, paddingBottom: 4, fontSize: 10 }]}>DEMO · Fictional content · Local only</Text>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'ios' || keyboardOpen}>
      {status !== 'populated' ? <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}>
        <DemoText heading>{status === 'error' ? 'DEMO · Couldn’t load Arena' : status === 'loading' ? 'DEMO · Loading conversations…' : 'DEMO · Nothing here yet'}</DemoText>
        <DemoText>This is an explicitly simulated {status} state.</DemoText><ArenaButton label={status === 'error' ? 'Retry demo' : 'Show demo content'} onPress={() => setStatus('populated')} />
      </View> : s.page.kind === 'home' ? <DemoHome state={s} dispatch={dispatch} navigate={navigate} openRoom={openRoom} onMore={() => setSheet({ kind: 'scenarios' })} />
        : s.page.kind === 'take' ? <DemoTakeDetail key={item.take.id} item={item} state={s} dispatch={dispatch} sheet={setSheet} openRoom={openRoom} />
        : s.page.kind === 'live' ? <DemoLiveDiscovery state={s} onOpen={openRoom} onChallenge={() => navigate({ kind: 'challenge' })} />
        : s.page.kind === 'challenge' ? <DemoChallenge state={s} onAccept={() => openRoom(s.data.takes[0].take.id)} onPass={() => { notice('Demo invitation passed. No real decision was submitted.'); navigate({ kind: 'live' }); }} />
        : s.page.kind === 'room' ? <DemoRoom state={s} dispatch={dispatch} onBack={back} onAssists={() => setSheet({ kind: 'assists' })} onHistory={() => setSheet({ kind: 'arguments' })} />
        : s.page.kind === 'groups' ? <DemoGroups state={s} navigate={navigate} />
        : s.page.kind === 'group' ? <ScrollView contentContainerStyle={styles.content}>
          {s.data.groups.filter(group => group.id === s.page.id).map(group => <React.Fragment key={group.id}>
            <GroupCard crew={{ ...group, viewer: { ...group.viewer, isMember: s.joined === group.id } }} onPress={() => notice('This is the selected demo community.')} featured />
            <ArenaButton label={s.joined === group.id ? 'Leave demo group' : s.joined ? 'Switch demo membership' : 'Join demo group'} onPress={() => dispatch({ type: 'join', id: group.id })} />
            <ArenaSectionHeading title="Community conversations" detail="Demo-only feed preview" />
            <ArenaSurface><ArenaBadge>Pinned · DEMO</ArenaBadge><DemoText heading>Start with curiosity. Leave room for another perspective.</DemoText><DemoText>Share an example, ask a question, and challenge ideas with care.</DemoText></ArenaSurface>
            {[s.data.takes[0], s.data.takes[1], s.data.takes[6]].map(post => <ArenaSurface key={post.take.id} style={{ gap: 8 }}><ArenaIdentity name={s.data.authors[post.take.authorId.endsWith('0') ? 0 : 1].name} detail="Community member · DEMO" /><DemoText>{post.take.text}</DemoText><ArenaButton label="Open demo discussion" onPress={() => navigate({ kind: 'take', id: post.take.id })} /></ArenaSurface>)}
          </React.Fragment>)}
        </ScrollView>
        : <DemoDiscover state={s} navigate={navigate} />}
    </KeyboardAvoidingView>
    {s.notice ? <View style={[styles.notice, { backgroundColor: c.inset }]}><Text accessibilityLiveRegion="polite" style={[arena.type.meta, { color: c.ink, flex: 1 }]}>DEMO · {s.notice}</Text><ArenaButton label="Dismiss" variant="tertiary" onPress={() => notice('')} /></View> : null}
    {showTabs && !keyboardOpen ? <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: c.line }]} accessibilityRole="tablist">{tabs.map(tab => <ArenaButton key={tab} label={titles[tab]} selected={s.page.kind === tab} variant={s.page.kind === tab ? 'secondary' : 'tertiary'} onPress={() => navigate({ kind: tab }, true)} style={{ flex: 1, paddingHorizontal: 3 }} />)}</View> : <View style={{ height: keyboardOpen ? 0 : insets.bottom }} />}
    {sheet ? <DemoSheet title={sheet.kind === 'assists' ? 'Private assists' : sheet.kind} onClose={() => setSheet(undefined)}>
      {sheet.kind === 'reply' ? <DemoForm label="Write a demo reply" onSend={(text, media) => { dispatch({ type: 'reply', id: sheet.id, parentId: sheet.parentId, text, media, at: Date.now() }); setSheet(undefined); }} /> : null}
      {sheet.kind === 'challenge' ? <><DemoText>A local counter-position. The normal 30-minute eligibility rule is retained for this simulation.</DemoText><DemoForm label="Demo counter-position (20–500 characters)" attachments={false} max={500} onSend={text => { dispatch({ type: 'challenge', id: sheet.id, text, at: Date.now() }); setSheet(undefined); }} /></> : null}
      {sheet.kind === 'history' ? <><DemoText>DEMO · Historical challenges and scripted outcomes</DemoText><ArenaSurface><DemoText heading>Accepted · completed discussion</DemoText><DemoText>A thoughtful counter-position from Priya.</DemoText><ArenaButton label="View settled demo duel" onPress={() => openRoom(sheet.id, 'SETTLED')} /></ArenaSurface><ArenaSurface><DemoText>Cancelled · no verdict</DemoText><ArenaButton label="View cancelled demo duel" onPress={() => openRoom(sheet.id, 'CANCELLED')} /></ArenaSurface>{s.challenges[sheet.id] ? <ArenaSurface><DemoText>Pending · {s.challenges[sheet.id]}</DemoText><ArenaButton label="Simulate acceptance" onPress={() => openRoom(sheet.id)} /></ArenaSurface> : null}</> : null}
      {sheet.kind === 'assists' ? <DemoAssists state={s} dispatch={dispatch} /> : null}
      {sheet.kind === 'arguments' ? s.official.map(message => <ArenaSurface key={message.id}><DemoText heading>Fighter {message.side} · DEMO argument</DemoText><DemoText>{message.text}</DemoText></ArenaSurface>) : null}
      {sheet.kind === 'media' ? <><DemoMedia kind={sheet.media} /><DemoText>Local illustration / animation. Native video playback, uploads and device pickers are not used in Demo Arena.</DemoText></> : null}
      {sheet.kind === 'scenarios' ? <><DemoText>Preview empty, loading and error states without changing connectivity.</DemoText>{(['populated', 'empty', 'loading', 'error'] as const).map(value => <ArenaButton key={value} label={`Show ${value} demo`} onPress={() => { setStatus(value); setSheet(undefined); }} />)}<ArenaButton label="Reset demo content" onPress={() => { dispatch({ type: 'reset', now: Date.now() }); setSheet(undefined); }} /><DemoText>Reset affects only this in-memory demo session.</DemoText></> : null}
    </DemoSheet> : null}
  </View>;
}

function DemoHome({ state: s, dispatch, navigate, openRoom, onMore }: { state: DemoState; dispatch: Dispatch; navigate: (page: Page) => void; openRoom: (id: string) => void; onMore: () => void }): React.JSX.Element {
  const [filter, setFilter] = React.useState('For You');
  const rows = filter === 'Popular' ? [...s.data.takes].sort((a, b) => b.take.reactions - a.take.reactions) : filter === 'Following' ? s.data.takes.filter((_, i) => i % 2 === 0) : filter === 'New' ? [...s.data.takes].sort((a, b) => b.take.createdAt - a.take.createdAt) : s.data.takes;
  return <FlatList data={rows} keyExtractor={item => item.take.id} initialNumToRender={4} windowSize={5} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={styles.content}><ArenaSectionHeading title="Fresh Takes" detail="24 fictional conversations · DEMO"><ArenaButton label="Demo controls" variant="tertiary" onPress={onMore} /></ArenaSectionHeading><ScrollView horizontal showsHorizontalScrollIndicator={false}>{['For You', 'Following', 'Popular', 'New'].map(value => <ArenaButton key={value} label={value} selected={filter === value} onPress={() => setFilter(value)} variant={filter === value ? 'secondary' : 'tertiary'} />)}</ScrollView></View>}
    renderItem={({ item, index }) => <TakeFeedCard take={{ ...item.take, reactions: item.take.reactions + (s.reacted.includes(item.take.id) ? 1 : 0) }} author={s.data.authors.find(author => author.id === item.take.authorId)!} isViewer={false}
      hasReacted={s.reacted.includes(item.take.id)} isSaved={s.saved.includes(item.take.id)} commentCount={s.replies[item.take.id].length} topComment={undefined} topCommentAuthor={undefined} index={index}
      onOpenAuthor={() => dispatch({ type: 'notice', text: 'Fictional demo profile. Real profiles are not opened.' })}
      onOpenDetail={() => navigate({ kind: 'take', id: item.take.id })} onOpenClash={() => openRoom(item.take.id)}
      onReact={() => dispatch({ type: 'react', id: item.take.id })} onSave={() => dispatch({ type: 'save', id: item.take.id })}
      onShare={() => dispatch({ type: 'notice', text: 'Sharing is unavailable in demo; nothing leaves this sandbox.' })} onMore={onMore}
      mediaPreview={item.media ? <DemoMedia kind={item.media} passive /> : undefined} />}
    ListFooterComponent={<View style={styles.content}><DemoText>End of demo feed · no public activity was loaded or created.</DemoText></View>} />;
}

function DemoTakeDetail({ item, state: s, dispatch, sheet, openRoom }: { item: DemoTake; state: DemoState; dispatch: Dispatch; sheet: (value: Sheet) => void; openRoom: (id: string) => void }): React.JSX.Element {
  const [sort, setSort] = React.useState<'best' | 'new'>('best'), [history, setHistory] = React.useState(false);
  const t = item.take, archived = t.status === 'expired' || t.expiresAt <= Date.now(), closed = !!takeChallengeIneligibility(t);
  const rows = sort === 'best' ? [...s.replies[t.id]].sort((a, b) => b.votes - a.votes) : [...s.replies[t.id]].reverse();
  return <View style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <TakeEditorialHeader take={t} author={s.data.authors.find(author => author.id === t.authorId)!} archived={archived} isViewer={false} />
    {item.media ? <DemoMedia kind={item.media} onOpen={() => sheet({ kind: 'media', media: item.media! })} /> : null}
    <TakeActionRow prominence="conversation" reactions={t.reactions + (s.reacted.includes(t.id) ? 1 : 0)} commentCount={rows.length} readOnly={archived} isSaved={s.saved.includes(t.id)} hasReacted={s.reacted.includes(t.id)} onReact={() => dispatch({ type: 'react', id: t.id })}
      onComment={() => archived ? dispatch({ type: 'notice', text: 'Archived demo discussion is read-only.' }) : sheet({ kind: 'reply', id: t.id })} onClash={() => sheet({ kind: 'history', id: t.id })} onSave={() => dispatch({ type: 'save', id: t.id })} onShare={() => dispatch({ type: 'notice', text: 'Sharing is unavailable in demo mode.' })} />
    <View style={styles.row}><View style={{ flex: 1 }}><DemoText heading>{archived ? 'Challenge history' : 'Challenges'}</DemoText><DemoText>{s.challenges[t.id] ? 'Pending demo challenge' : 'Historical examples · DEMO'}</DemoText></View><ArenaButton label="History" onPress={() => sheet({ kind: 'history', id: t.id })} />{!closed && !s.challenges[t.id] ? <ArenaButton label="Challenge demo" onPress={() => sheet({ kind: 'challenge', id: t.id })} /> : null}</View>
    <ArenaButton label={history ? 'Hide demo stance voting' : 'Show demo stance voting'} variant="tertiary" onPress={() => setHistory(value => !value)} />
    {history ? <ArenaSurface><DemoText>Where do you stand? · DEMO votes</DemoText><View style={styles.row}>{['Agree', 'Unsure', 'Disagree'].map((stance, i) => <ArenaButton key={stance} label={`${stance} ${[14, 3, 7][i] + (s.stances[t.id] === stance ? 1 : 0)}`} disabled={archived} selected={s.stances[t.id] === stance} onPress={() => dispatch({ type: 'stance', id: t.id, stance, at: Date.now() })} />)}</View></ArenaSurface> : null}
    <ArenaSectionHeading title="Discussion" detail={`${rows.length} demo replies`}><ArenaReplySort value={sort} onChange={setSort} /></ArenaSectionHeading>
    {rows.length ? <DemoThread state={s} rows={rows} onReply={parentId => archived ? dispatch({ type: 'notice', text: 'Archived demo discussion is read-only.' }) : sheet({ kind: 'reply', id: t.id, parentId })} onVote={id => dispatch({ type: 'reply-vote', takeId: t.id, id })} onMedia={media => sheet({ kind: 'media', media })} /> : <DemoText>No replies yet. Add a local demo perspective.</DemoText>}
    <ArenaButton label="View scripted live duel" onPress={() => openRoom(t.id)} />
  </ScrollView><View style={[styles.replyBar, { borderColor: useThemeColors().border }]}>{archived ? <DemoText>Archived · replies are closed</DemoText> : <ArenaButton label="Write a demo reply…" onPress={() => sheet({ kind: 'reply', id: t.id })} style={{ alignItems: 'flex-start' }} />}</View></View>;
}

function DemoGroups({ state: s, navigate }: { state: DemoState; navigate: (page: Page) => void }): React.JSX.Element {
  const [filter, setFilter] = React.useState('Explore');
  return <ScrollView contentContainerStyle={styles.content}><DemoText heading>Better together.</DemoText><DemoText>Fictional communities, counts and conversation previews · DEMO</DemoText>
    <View style={styles.row}>{['Joined', 'Explore'].map(value => <ArenaButton key={value} label={value} selected={filter === value} onPress={() => setFilter(value)} />)}</View>
    {s.data.groups.filter(group => filter !== 'Joined' || group.id === s.joined).map((group, i) => <GroupCard key={group.id} crew={{ ...group, memberCount: group.memberCount + (s.joined === group.id ? 1 : 0) - (group.viewer.isMember ? 1 : 0), viewer: { ...group.viewer, isMember: s.joined === group.id, activeCrewId: s.joined } }} featured={i === 0} onPress={() => navigate({ kind: 'group', id: group.id })} />)}
    {filter === 'Joined' && !s.joined ? <DemoText>You haven’t joined a demo community yet.</DemoText> : null}
  </ScrollView>;
}

function DemoDiscover({ state: s, navigate }: { state: DemoState; navigate: (page: Page) => void }): React.JSX.Element {
  const [selected, setSelected] = React.useState(s.page.kind === 'topic' ? s.page.id : s.data.topics[0].id);
  const [mode, setMode] = React.useState('Topic map'), topic = s.data.topics.find(topic => topic.id === selected)!;
  return <ScrollView contentContainerStyle={styles.content}><DemoText heading>Ideas connect.</DemoText><DemoText>DEMO topic relationships and scripted activity, not real trends</DemoText>
    <View style={styles.row}>{['Topic map', 'Trending now'].map(value => <ArenaButton key={value} label={value} selected={mode === value} onPress={() => setMode(value)} />)}</View>
    <DemoConstellation topics={mode === 'Topic map' ? s.data.topics : [...s.data.topics].sort((a, b) => b.activity - a.activity)} selected={selected} onSelect={setSelected} />
    <DemoText>Lines connect shared topic communities · Tap a node</DemoText>
    <ArenaSurface style={{ gap: 12 }}><DemoText heading>{topic.label}</DemoText><DemoText>{topic.description}</DemoText><DemoText>{topic.activity} simulated conversations · DEMO</DemoText><ArenaButton label="Explore demo conversation" onPress={() => navigate({ kind: 'take', id: s.data.takes[s.data.topics.indexOf(topic)].take.id })} /></ArenaSurface>
  </ScrollView>;
}

function DemoRoom({ state: s, dispatch, onBack, onAssists, onHistory }: { state: DemoState; dispatch: Dispatch; onBack: () => void; onAssists: () => void; onHistory: () => void }): React.JSX.Element {
  const keyboardOpen = useKeyboardVisible();
  const [developerOpen, setDeveloperOpen] = React.useState(false), [resultOpen, setResultOpen] = React.useState(false);
  const [reaction, setReaction] = React.useState<{ emoji: string; key: string } | null>(null), [ballot, setBallot] = React.useState<string>();
  const duel = demoDuel(s), closed = duel.status !== 'open', last = s.official.at(-1)!;
  const phase = s.phase === 'FINAL' ? 'final_arguments' : s.phase === 'JUDGING' ? 'judging' : closed ? 'closed' : 'open';
  const presentation = duelPresentation(duel, phase);
  const latest: ArenaMessage = { id: last.id, roomId: 'demo-room', kind: 'text', body: last.text, parentMessageId: null, createdAt: last.createdAt ?? s.now, mediaUrl: null, mediaKind: null, gifProvider: null, gifExternalId: null, isOwn: s.role === `fighter_${last.side.toLowerCase()}`, author: { ...s.data.authors.find(author => author.id === (last.side === 'A' ? duel.fighterA.id : duel.fighterB.id))!, avatarTint: s.data.authors[0].tint }, reactions: [], replyCount: 0, argumentVotes: null };
  const crowd: CrowdModel = { messages: s.crowd, context: { roomId: 'demo-room', canSend: !closed, spectatorCount: 42, serverNow: new Date(s.now).toISOString(), closesAt: new Date(s.now + 1800000).toISOString() }, loading: false, error: null, connected: true, sending: false, hasOlder: false, olderBusy: false, identityVersion: ['spectator', 'fighter_a', 'fighter_b'].indexOf(s.role), refresh: async () => {}, loadOlder: async () => {}, send: async (text, key) => { if (closed || !validCrowdText(text)) return false; dispatch({ type: 'crowd', text, key }); return true; } };
  return <View style={{ flex: 1 }}>{developerOpen ? <DemoSheet title="Developer controls" onClose={() => setDeveloperOpen(false)}><ArenaButton label="Simulate next official argument" disabled={!['OPEN','FINAL'].includes(s.phase)} onPress={() => {dispatch({type:'receive-argument',at:Date.now()});setDeveloperOpen(false);}} /><ArenaButton label="Advance demo phase" disabled={closed} onPress={() => {dispatch({type:'phase',phase:s.phase === 'OPEN' ? 'FINAL' : s.phase === 'FINAL' ? 'JUDGING' : 'SETTLED'});setDeveloperOpen(false);}} /><View style={styles.row}>{(['OPEN', 'FINAL', 'JUDGING', 'SETTLED', 'DRAW', 'CANCELLED'] as Phase[]).map(phase => <ArenaButton key={phase} label={phase} selected={s.phase === phase} variant="tertiary" onPress={() => { setBallot(undefined); dispatch({ type: 'phase', phase }); }} />)}</View>
    <View style={styles.row}>{(['spectator', 'fighter_a', 'fighter_b'] as Role[]).map(role => <ArenaButton key={role} label={role === 'spectator' ? 'Spectator' : role === 'fighter_a' ? 'Fighter A' : 'Fighter B'} selected={s.role === role} variant="tertiary" onPress={() => dispatch({ type: 'role', role })} />)}<ArenaButton label="Private assists" onPress={onAssists} /></View>
    </DemoSheet> : null}
    {resultOpen ? <DemoSheet title="Scripted demo result" onClose={() => setResultOpen(false)}><DuelRoomOutcome revealMotion duel={duel} phase={phase} onJudge={async () => {}} onReview={() => {setResultOpen(false);onHistory();}} /></DemoSheet> : null}
    <ImmersiveClash viewerScope={duel.clashId + s.role} eventHint={'DEMO · ' + presentation.hint} onViewResult={closed ? () => setResultOpen(true) : undefined} condensed={keyboardOpen} duel={duel} proposition={duel.sourceText!} live={!closed} statusLabel={closed ? 'DEMO HISTORY' : 'DEMO LIVE'} phaseLabel={s.phase} spectatorCount={42} focusSide={last.side} latestMessage={latest} paddingTop={4} backingSide={s.backing} onBackSide={side => dispatch({ type: 'backing', side })} canBack={!closed && s.role === 'spectator'} onBack={onBack} onOpenProfile={() => dispatch({ type: 'notice', text: 'Fictional fighter profile. No real profile was opened.' })} onViewHistory={onHistory} onMore={() => setDeveloperOpen(true)} roleLabel={`DEMO · ${s.role}`} crowd={crowd} reactionBurst={reaction}
      stageFooter={<View style={{ paddingHorizontal: 16, gap: 8 }}>{duel.verdict ? <DemoText heading>{s.phase === 'DRAW' ? 'DRAW · 3–3' : 'Fighter A · 4–2'} · SCRIPTED DEMO RESULT</DemoText> : s.phase === 'CANCELLED' ? <DemoText>Cancelled · no verdict · DEMO</DemoText> : s.phase === 'JUDGING' ? <><DemoText>Demo judgement · no rewards or real verdict</DemoText><View style={styles.row}>{s.role === 'spectator' ? ['A', 'B'].map(side => <ArenaButton key={side} label={ballot === side ? `Voted ${side} · demo` : `Demo vote ${side}`} disabled={!!ballot} onPress={() => setBallot(side)} />) : <DemoText>Demo fighters cannot judge.</DemoText>}</View></> : <View style={styles.row}>{['👏', '🔥', '🤔'].map(emoji => <ArenaButton key={emoji} label={emoji} onPress={() => { setReaction({ emoji, key: String(Date.now()) }); dispatch({ type: 'notice', text: 'Reaction simulated locally.' }); }} />)}<ArenaButton label="Argument history" onPress={onHistory} /><ArenaButton label={s.role === 'spectator' ? 'Private assist' : 'Assist inbox'} onPress={onAssists} /></View>}</View>}
      fighterComposer={s.role !== 'spectator' && ['OPEN', 'FINAL'].includes(s.phase) ? <View style={{ padding: 12 }}><DemoForm label="Official demo argument" attachments={false} max={1200} onSend={text => dispatch({ type: 'official', text })} /></View> : undefined} />
  </View>;
}

function DemoAssists({ state: s, dispatch }: { state: DemoState; dispatch: Dispatch }): React.JSX.Element {
  const recipient = demoDuel(s);
  const [target, setTarget] = React.useState<'A' | 'B'>(s.backing ?? 'A'), closed = !['OPEN', 'FINAL'].includes(s.phase);
  return <View style={{ gap: 12 }}><DemoText>Private to the selected demo fighter. Switch roles in More to review recipient isolation. Acceptance does not publish an argument.</DemoText>
    {s.role === 'spectator' && !closed ? <><View style={styles.row}>{(['A', 'B'] as const).map(side => <ArenaButton key={side} label={`Assist Fighter ${side}`} selected={target === side} onPress={() => setTarget(side)} />)}</View><DemoText>To {target === 'A' ? recipient.fighterA.name : recipient.fighterB.name} · Fighter {target} · Private demo</DemoText><DemoForm label="Write a private demo assist" max={500} onSend={(text, media) => dispatch({ type: 'assist', target, text, media })} /></> : null}
    {closed ? <DemoText>This demo phase is read-only.</DemoText> : null}
    {visibleDemoAssists(s).length ? visibleDemoAssists(s).map(item => <ArenaSurface key={item.id} style={{ gap: 8 }}><ArenaBadge>DEMO · To Fighter {item.target} · {item.status}</ArenaBadge><DemoText>{item.text}</DemoText>{item.media ? <DemoMedia kind={item.media} compact /> : null}
      {s.role !== 'spectator' && !closed ? <View style={styles.row}>{item.status === 'pending' ? <><ArenaButton label="Accept assist" onPress={() => dispatch({ type: 'assist-decision', id: item.id, decision: 'accepted' })} /><ArenaButton label="Reject assist" onPress={() => dispatch({ type: 'assist-decision', id: item.id, decision: 'rejected' })} /></> : item.status === 'accepted' ? <ArenaButton label={item.published ? 'Published once · DEMO' : 'Publish accepted assist'} disabled={item.published} onPress={() => dispatch({ type: 'assist-publish', id: item.id })} /> : null}</View> : null}
    </ArenaSurface>) : <DemoText>No assists visible to this demo role.</DemoText>}
  </View>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 14, paddingBottom: 24, maxWidth: 680, width: '100%', alignSelf: 'center' }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }, tabs: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingHorizontal: 8 }, notice: { paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }, replyBar: { padding: 10, borderTopWidth: 1 } });
