import type { Take, User } from '../../../store/types';
import type { ArenaCrew } from '../../../utils/arenaCrewPayload';
import type { ArenaDuel } from '../../../utils/arenaDuelPayload';
import type { CrowdMessage } from '../../../utils/arenaCrowd';
import { validCrowdText } from '../../../utils/arenaCrowd';
import { takeChallengeIneligibility } from '../../../utils/takeChallengeEligibility';

export const DEMO_CANARY = 'CLASH_DEMO_ARENA_FIXTURES_V1_NOT_FOR_RELEASE';
export type Page = { kind: 'challenge' | 'home' | 'take' | 'live' | 'room' | 'groups' | 'group' | 'discover' | 'topic'; id?: string };
export type Phase = 'OPEN' | 'FINAL' | 'JUDGING' | 'SETTLED' | 'DRAW' | 'CANCELLED';
export type Role = 'spectator' | 'fighter_a' | 'fighter_b';
export type DemoMediaKind = 'image' | 'video' | 'gif';
export interface DemoTake { take: Take; replies: number; media?: DemoMediaKind }
export interface DemoReply { id: string; parentId?: string; author: number; text: string; votes: number; voted?: boolean; media?: DemoMediaKind }
export interface DemoAssist { id: string; target: 'A' | 'B'; text: string; media?: DemoMediaKind; status: 'pending' | 'accepted' | 'rejected'; published: boolean; isOwn?: boolean }
export interface DemoOfficial { id: string; side: 'A' | 'B'; text: string; createdAt?: number }
export interface DemoTopic { id: string; label: string; hoods: string[]; description: string; activity: number }
export interface DemoData { takes: DemoTake[]; authors: User[]; groups: ArenaCrew[]; topics: DemoTopic[] }
export interface DemoState {
  data: DemoData; now: number; page: Page; history: Page[]; theme: 'dark' | 'light';
  reacted: string[]; saved: string[]; replies: Record<string, DemoReply[]>; stances: Record<string, string>;
  challenges: Record<string, string>; joined: string | null; phase: Phase; role: Role;
  backing: 'A' | 'B' | null; crowd: CrowdMessage[]; assists: DemoAssist[]; official: DemoOfficial[];
  notice: string | null; next: number;
}
const statements = [
  'The best technology gives us our attention back.',
  'A great city should be designed for the walk home, not the drive to work.',
  'AI will make junior developers more valuable, not less.',
  'A four-day work week should be measured in outcomes, not hours.',
  'A film does not need a sequel just because the first one worked.',
  'Public libraries are the most underrated social network.',
  'Your favourite album changes when you hear it live.',
  'Not every hobby needs to become a side hustle.',
  'Football is better when the underdog has a real chance.',
  'Good games teach you how to fail without giving up.',
  'Repairable devices should be the default, not a premium feature.',
  'A small independent café is better urban infrastructure than another parking lot.',
  'We should teach media literacy before teaching students to prompt AI.',
  'A beautiful interface should still work with large text and one hand.',
  'The most interesting conversations happen when nobody is trying to win.',
  'Remote work gives you time back. You still have to decide what to do with it.',
  'A photograph is sometimes a better argument than a thousand statistics.',
  'Archived discussions can be more useful than the newest hot take.',
  'Independent creators need audiences, not another algorithm to please.',
  'The best trip has one completely unplanned afternoon.',
  'Open-source maintenance deserves the same respect as launching a new app.',
  'Our community garden taught me more about collaboration than any productivity course.',
  'A fair debate needs room for uncertainty. If someone changes their mind, that should be treated as learning rather than losing. The best conversations give both people a chance to explain what evidence would persuade them, without turning a complex question into a popularity contest.',
  'Sometimes the strongest opinion is “I need to think about this more.”',
];
export function createDemoData(now: number): DemoData {
  const names = ['Alex Morgan', 'Priya Shah', 'Sam Lee', 'Jordan Okafor', 'Maya Chen', 'Arjun Rao', 'Sofia Rivera', 'Taylor With An Intentionally Very Long Display Name', 'Noor Ahmed', 'Leo Park', 'Amara Jones', 'Ishan Mehta'];
  const hoods: Take['hood'][] = ['techtakes', 'startups', 'movies', 'gaming', 'football', 'campushustle'];
  const authors: User[] = names.map((name, i) => ({ id: `demo-author-${i}`, name, handle: i === 7 ? 'a_very_long_username_for_small_screen_review' : name.toLowerCase().split(' ').slice(0, 2).join('_'), tint: ['#6489AC', '#AA7575', '#7B8F7A'][i % 3], hood: hoods[i % hoods.length], rank: 'Rookie', reputation: 0, coins: 0, clashes: 0, wins: 0, streak: 0, badges: [] }));
  const takes = statements.map((text, i): DemoTake => {
    const archived = i === 4 || i === 17;
    return { take: { id: `demo-take-${i}`, authorId: authors[i % authors.length].id, text, hood: hoods[i % hoods.length], createdAt: now - (i + 1) * 37 * 60000, expiresAt: archived ? now - 3600000 : now + (i === 14 ? 20 * 60000 : 12 * 3600000), status: archived ? 'expired' : 'active', reactions: i === 7 ? 0 : [24, 87, 142, 6, 53, 18][i % 6], clashes: i % 4 === 0 ? 2 : 0 }, replies: i === 7 ? 0 : i === 2 ? 48 : 6 + i % 8, media: i % 5 === 1 ? 'image' : i % 5 === 3 ? 'video' : i % 5 === 4 ? 'gif' : undefined };
  });
  const groups: ArenaCrew[] = ['Builders’ Commons', 'Cinema After Hours', 'The Thoughtful Internet', 'Sunday Football Club', 'Design For People', 'Campus Common Room'].map((name, i) => ({ id: `demo-group-${i}`, slug: ['builders','cinema','thoughtful','football','design','campus'][i], name, bio: ['Useful tools. Careful questions. Better conversations about what we build.', 'Small films, big ideas, and the scene you can’t stop thinking about.', 'Make room for nuance. Share a perspective, then listen to another.'][i % 3], avatarUrl: null, bannerUrl: null, specialties: [['Technology', 'Startups'], ['Cinema', 'Culture'], ['Ideas', 'Community']][i % 3], joinMode: i === 3 ? 'REQUEST' : 'OPEN', memberCount: [864, 231, 1532, 317, 492, 126][i], followerCount: 0, totalReputation: 0, seasonalRating: 0, wins: 0, losses: 0, streak: 0, createdAt: new Date(now - 86400000 * 30).toISOString(), viewer: { isMember: i === 0, role: i === 0 ? 'MEMBER' : null, isFollowing: false, hasPendingRequest: false, activeCrewId: 'demo-group-0' } }));
  const topics: DemoTopic[] = ['AI & creativity', 'Human-centred design', 'Future of work', 'Independent cinema', 'Digital wellbeing', 'Cities for people', 'Open source', 'Everyday culture', 'Games & learning'].map((label, i) => ({ id: `demo-topic-${i}`, label, hoods: i < 3 || i === 4 || i === 6 ? ['techtakes', 'startups'] : i === 3 || i === 7 ? ['movies'] : ['campushustle', 'gaming'], description: ['What do we gain when our tools do less, but do it better?', 'Explore the people, systems and choices behind this conversation.', 'Different experiences can lead to equally thoughtful conclusions.'][i % 3], activity: [128, 76, 94, 53, 62, 41, 86, 35, 58][i] }));
  return { takes, authors, groups, topics };
}
function initialReplies(count: number): DemoReply[] {
  const bodies = ['Useful tools should make it easier to leave the screen. That’s a better measure than time spent.', 'I agree with the goal, but the trade-offs matter. Who gets to decide what is useful?', 'Exactly. Less friction, more intention.', 'The example from my own community was quite different.', 'Could we compare a small experiment before making a universal rule?', 'This is why I like reading both sides before choosing a stance.'];
  return Array.from({ length: count }, (_, i) => ({ id: `demo-reply-${i}`, author: i % 12, parentId: i % 5 === 2 ? `demo-reply-${i - 1}` : i % 5 === 3 ? `demo-reply-${i - 1}` : undefined, text: bodies[i % bodies.length], votes: [8, 3, 12, 1, 0, 5][i % 6], media: i === 3 ? 'gif' : i === 6 ? 'image' : undefined }));
}
export function createDemoState(now = Date.now()): DemoState {
  const data = createDemoData(now);
  return { data, now, page: { kind: 'home' }, history: [], theme: 'dark', reacted: [], saved: [], replies: Object.fromEntries(data.takes.map(t => [t.take.id, initialReplies(t.replies)])), stances: {}, challenges: {}, joined: 'demo-group-0', phase: 'OPEN', role: 'spectator', backing: null, crowd: Array.from({ length: 18 }, (_, i) => ({ id: `demo-chat-${i}`, roomId: 'demo-room', body: ['That distinction between convenience and attention is important.', 'I’d like to hear the counter-example.', 'Both sides are making a thoughtful case.', 'The community library example is a good one.', 'Less certainty, more evidence.'][i % 5], createdAt: new Date(now - (18 - i) * 15000).toISOString(), isOwn: false, author: { id: data.authors[i % 12].id, name: data.authors[i % 12].name, handle: data.authors[i % 12].handle, avatarTint: data.authors[i % 12].tint } })), assists: [{ id: 'demo-assist-a', target: 'A', text: 'A useful example: notification digests instead of constant interruptions.', status: 'pending', published: false }, { id: 'demo-assist-b', target: 'B', text: 'Consider accessibility: some real-time notifications are essential.', media: 'image', status: 'pending', published: false }], official: [{ id: 'demo-argument-a', side: 'A', createdAt: now - 60000, text: 'A tool should help us finish the task, then give us our attention back. More time in the app is not necessarily more value.' }, { id: 'demo-argument-b', side: 'B', createdAt: now - 30000, text: 'Connection and creativity also happen on screens. We should measure intention and access, not simply minimise screen time.' }], notice: null, next: 100 };
}
export type DemoAction =
  | { type: 'receive-argument'; at: number }
  | { type: 'open-room'; id: string; phase: Phase }
  | { type: 'reply-vote'; takeId: string; id: string }
  | { type: 'navigate'; page: Page; tab?: boolean } | { type: 'back' } | { type: 'theme' } | { type: 'notice'; text: string | null }
  | { type: 'reset'; now: number } | { type: 'react' | 'save'; id: string }
  | { type: 'reply'; id: string; text: string; parentId?: string; media?: DemoMediaKind; at: number }
  | { type: 'stance'; id: string; stance: string; at: number } | { type: 'challenge'; id: string; text: string; at: number }
  | { type: 'join'; id: string } | { type: 'phase'; phase: Phase } | { type: 'role'; role: Role } | { type: 'backing'; side: 'A' | 'B' }
  | { type: 'crowd'; text: string; key: string } | { type: 'official'; text: string }
  | { type: 'assist'; text: string; target: 'A' | 'B'; media?: DemoMediaKind }
  | { type: 'assist-decision'; id: string; decision: 'accepted' | 'rejected' } | { type: 'assist-publish'; id: string };
const terminal = (s: DemoState) => ['SETTLED', 'DRAW', 'CANCELLED'].includes(s.phase);
const sideFor = (s: DemoState) => s.role === 'fighter_a' ? 'A' : s.role === 'fighter_b' ? 'B' : null;
export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  const notice = (text: string) => ({ ...s, notice: text });
  const take = 'id' in a ? s.data.takes.find(t => t.take.id === a.id)?.take : undefined;
  switch (a.type) {
    case 'open-room': {
      const source = s.data.takes.find(t => t.take.id === a.id); if (!source) return s;
      return { ...s, page: { kind: 'room', id: a.id }, history: [...s.history, s.page], phase: a.phase, role: 'spectator', backing: null,
        official: [{ id: 'demo-opening-a', side: 'A', text: source.take.text + ' Thoughtful design should make this a deliberate choice.' }, { id: 'demo-opening-b', side: 'B', text: 'The counterpoint is about access and context. Different people need different tools, and the trade-offs deserve attention.' }], notice: null };
    }
    case 'reply-vote': return { ...s, replies: { ...s.replies, [a.takeId]: (s.replies[a.takeId] ?? []).map(row => row.id === a.id ? { ...row, votes: row.votes + (row.voted ? -1 : 1), voted: !row.voted } : row) } };
    case 'reset': return createDemoState(a.now);
    case 'navigate': return { ...s, page: a.page, history: a.tab ? [] : [...s.history, s.page], notice: null };
    case 'back': return { ...s, page: s.history.at(-1) ?? { kind: 'home' }, history: s.history.slice(0, -1), notice: null };
    case 'theme': return { ...s, theme: s.theme === 'dark' ? 'light' : 'dark' };
    case 'notice': return { ...s, notice: a.text };
    case 'save': return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter(id => id !== a.id) : [...s.saved, a.id] };
    case 'react': return !take || take.status !== 'active' ? notice('Archived demo Take · reactions are closed.') : { ...s, reacted: s.reacted.includes(a.id) ? s.reacted.filter(id => id !== a.id) : [...s.reacted, a.id] };
    case 'reply': return !take || take.status !== 'active' || take.expiresAt <= a.at || !a.text.trim() ? notice('This demo discussion is read-only, or the reply is empty.') : { ...s, next: s.next + 1, replies: { ...s.replies, [a.id]: [...s.replies[a.id], { id: `demo-local-${s.next}`, parentId: a.parentId, author: 2, text: a.text.trim().slice(0, 180), votes: 0, media: a.media }] }, notice: 'Reply added locally. Nothing was posted.' };
    case 'stance': return !take || take.status !== 'active' || take.expiresAt <= a.at ? notice('Archived demo voting is closed.') : { ...s, stances: { ...s.stances, [a.id]: a.stance }, notice: 'Demo stance saved in memory only.' };
    case 'challenge': return takeChallengeIneligibility(take, a.at) || a.text.trim().length < 20 ? notice('Demo challenge unavailable: use an active Take with more than 30 minutes remaining and at least 20 characters.') : { ...s, challenges: { ...s.challenges, [a.id]: a.text.slice(0, 500) }, notice: 'Demo challenge pending. No real challenge was created.' };
    case 'join': return s.data.groups.find(g => g.id === a.id)?.joinMode !== 'OPEN' ? notice('Join request simulated. No real membership changed.') : { ...s, joined: s.joined === a.id ? null : a.id, notice: 'Demo membership updated. Only one demo community can be joined.' };
    case 'receive-argument': {
      if (!['OPEN','FINAL'].includes(s.phase)) return notice('Demo arguments are closed in this phase.');
      const last = s.official.at(-1), side = last?.side === 'A' ? 'B' : 'A';
      return {...s,next:s.next+1,official:[...s.official,{id:'demo-incoming-'+s.next,side,text:side === 'A' ? 'A practical test is whether a tool helps someone finish what they came to do, then leave with more agency.' : 'Access matters too: the same tool can be a distraction for one person and an essential connection for another.',createdAt:a.at}],notice:null};
    }
    case 'phase': return { ...s, phase: a.phase, notice: 'Scripted demo phase. No real clock or outcome was changed.' };
    case 'role': return { ...s, role: a.role, notice: null };
    case 'backing': return terminal(s) ? s : { ...s, backing: s.backing === a.side ? null : a.side };
    case 'crowd': {
      if (terminal(s) || !validCrowdText(a.text) || s.crowd.some(m => m.id === `demo-send-${a.key}`)) return s;
      return { ...s, crowd: [...s.crowd, { ...s.crowd[0], id: `demo-send-${a.key}`, body: a.text.trim(), isOwn: true, createdAt: new Date(s.now + s.next).toISOString(), author: { ...s.crowd[0].author, id: s.data.authors[2].id, name: s.data.authors[2].name, handle: s.data.authors[2].handle } }], next: s.next + 1 };
    }
    case 'official': return !sideFor(s) || !['OPEN', 'FINAL'].includes(s.phase) || !a.text.trim() ? notice('Only the selected demo fighter can publish during an argument phase.') : { ...s, next: s.next + 1, official: [...s.official, { id: `demo-official-${s.next}`, side: sideFor(s)!, text: a.text.trim().slice(0, 1200) }] };
    case 'assist': return s.role !== 'spectator' || terminal(s) || (!a.text.trim() && !a.media) ? notice('Demo assists require a spectator and an open event.') : { ...s, next: s.next + 1, assists: [...s.assists, { id: `demo-assist-${s.next}`, target: a.target, text: a.text.slice(0, 500), media: a.media, status: 'pending', published: false, isOwn: true }], notice: `Private demo assist sent to Fighter ${a.target}.` };
    case 'assist-decision': return terminal(s) ? s : { ...s, assists: s.assists.map(item => item.id === a.id && item.target === sideFor(s) && item.status === 'pending' ? { ...item, status: a.decision } : item) };
    case 'assist-publish': {
      const item = s.assists.find(item => item.id === a.id && item.target === sideFor(s) && item.status === 'accepted' && !item.published);
      if (!item || !['OPEN', 'FINAL'].includes(s.phase)) return notice('Only an accepted assist can be explicitly published by its selected fighter.');
      return { ...s, assists: s.assists.map(old => old.id === item.id ? { ...old, published: true } : old), official: [...s.official, { id: `demo-published-${item.id}`, side: item.target, text: item.text || 'Demo media contribution' }], notice: 'Published once to the local demo transcript.' };
    }
  }
}
export function demoDuel(s: DemoState): ArenaDuel {
  const index = Math.max(0, s.data.takes.findIndex(t => t.take.id === s.page.id));
  const fighterA = s.data.authors[index === 0 ? 0 : (index + 2) % s.data.authors.length], fighterB = s.data.authors[index === 0 ? 1 : (index + 3) % s.data.authors.length];
  return { clashId: 'demo-clash', status: terminal(s) ? s.phase === 'CANCELLED' ? 'cancelled' : 'settled' : 'open', fighterA: { ...fighterA, tint: '#6489AC' }, fighterB: { ...fighterB, tint: '#AA7575' }, viewerRelationship: s.role, mayJudge: s.phase === 'JUDGING' && s.role === 'spectator', hasJudged: false, sourceText: s.data.takes.find(t => t.take.id === s.page.id)?.take.text ?? s.data.takes[0].take.text, counterPosition: 'We should measure intention and access, not simply minimise screen time.', verdict: s.phase === 'SETTLED' || s.phase === 'DRAW' ? { winnerSide: s.phase === 'DRAW' ? 'DRAW' : 'A', jurySize: 6, sideAScore: s.phase === 'DRAW' ? 3 : 4, sideBScore: s.phase === 'DRAW' ? 3 : 2, verdictLabel: 'SCRIPTED DEMO RESULT' } : null };
}
export function visibleDemoAssists(s: DemoState): DemoAssist[] {
  return s.role === 'spectator' ? s.assists.filter(a => a.isOwn) : s.assists.filter(a => a.target === sideFor(s));
}
