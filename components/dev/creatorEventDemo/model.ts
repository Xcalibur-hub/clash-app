import { interactionIsOpen } from '../../../utils/creatorLiveState';

/** One local ballot, not an estimate of a remote audience. Nothing is persisted. */
export const PAPER_OPTIONS = [
  { id: 'bridge', title: 'Build a bridge', brief: 'Span the gap with one sheet.', effect: 'The paper becomes a bridge. The challenge is now to span the gap without cutting.' },
  { id: 'tower', title: 'Raise a tower', brief: 'Trade width for height.', effect: 'The paper rises into a tower. The challenge is now to build tall with a freestanding base.' },
  { id: 'spiral', title: 'Make a spiral', brief: 'Turn a flat sheet into a curve.', effect: 'The paper curls into a spiral. The challenge is now to make a continuous curve without glue.' },
] as const;
export type PaperChoice = typeof PAPER_OPTIONS[number]['id'];
export type EventPhase = 'entry' | 'voting' | 'closed' | 'reveal' | 'finished';
export type DemoEvent = { phase: EventPhase; role: 'audience' | 'host'; selected: PaperChoice | null; ballot: PaperChoice | null; closesAt: number | null };
export type DemoAction = { type: 'enter' | 'tick' | 'confirm' | 'advance'; now: number }
  | { type: 'select'; choice: PaperChoice; now: number } | { type: 'role'; role: DemoEvent['role'] } | { type: 'reset' };
export const initialEvent = (): DemoEvent => ({ phase: 'entry', role: 'audience', selected: null, ballot: null, closesAt: null });
export function eventStep(state: DemoEvent, action: DemoAction): DemoEvent {
  if (action.type === 'reset') return initialEvent();
  if (action.type === 'role') return { ...state, role: action.role };
  if (action.type === 'enter') return state.phase === 'entry' ? { ...state, phase: 'voting', closesAt: action.now + 45_000 } : state;
  const expired = state.phase === 'voting' && !interactionIsOpen('OPEN', state.closesAt, action.now);
  if (action.type === 'tick') return expired ? { ...state, phase: 'closed' } : state;
  if (action.type === 'advance') {
    if (state.role !== 'host') return state;
    const next = { voting: 'closed', closed: 'reveal', reveal: 'finished' } as const;
    return state.phase in next ? { ...state, phase: next[state.phase as keyof typeof next] } : state;
  }
  if (expired) return { ...state, phase: 'closed' };
  if (state.phase !== 'voting' || state.role !== 'audience' || state.ballot) return state;
  if (action.type === 'select') return PAPER_OPTIONS.some(option => option.id === action.choice) ? { ...state, selected: action.choice } : state;
  return state.selected ? { ...state, ballot: state.selected } : state;
}
export const appliedChoice = (state: DemoEvent) =>
  state.phase === 'reveal' || state.phase === 'finished' ? PAPER_OPTIONS.find(option => option.id === state.ballot) ?? null : null;
