export type Puzzle = {
  id: string; title: string; size: 2 | 3; rule: 'orbit' | 'grow' | 'turn' | 'merge' | 'dual';
  frames: readonly number[]; options: readonly [number, number, number]; explanation: string;
};

// Bit zero is the top-left light; rows read left to right. Fixed, reviewed puzzles.
export const SIGNAL_PUZZLES: readonly Puzzle[] = [
  { id: 'orbit', title: 'Find the rhythm', size: 2, rule: 'orbit', frames: [1, 2, 8], options: [4, 1, 8],
    explanation: 'The light moves one corner clockwise: top left, top right, bottom right, then bottom left.' },
  { id: 'grow', title: 'Watch it build', size: 2, rule: 'grow', frames: [1, 3, 7], options: [5, 15, 11],
    explanation: 'One light is added each beat, reading across each row. Three lights become four; none disappear.' },
  { id: 'turn', title: 'Turn the shape', size: 3, rule: 'turn', frames: [25, 22, 304], options: [25, 304, 208],
    explanation: 'The whole shape turns a quarter-turn clockwise each beat. The center stays lit while the outer pair rotates.' },
  { id: 'merge', title: 'Keep only the differences', size: 3, rule: 'merge', frames: [73, 7, 78, 73], options: [7, 79, 0],
    explanation: 'Combine the last two frames. A light survives only when it appears in exactly one of them. The next frame is the top row.' },
  { id: 'dual', title: 'Follow both signals', size: 3, rule: 'dual', frames: [1, 20, 256, 80], options: [17, 4, 1],
    explanation: 'The corner light travels clockwise while the center alternates off and on. Next: top left, with the center off.' },
];

export function rotateSignal(mask: number, size: number): number {
  let result = 0;
  for (let i = 0; i < size * size; i++) if (mask & (1 << i)) {
    const row = Math.floor(i / size), column = i % size;
    result |= 1 << (column * size + size - 1 - row);
  }
  return result;
}

export function expectedSignal(puzzle: Puzzle): number {
  const last = puzzle.frames[puzzle.frames.length - 1];
  switch (puzzle.rule) {
    case 'orbit': case 'turn': return rotateSignal(last, puzzle.size);
    case 'grow': return last | (last + 1);
    case 'merge': return last ^ puzzle.frames[puzzle.frames.length - 2];
    case 'dual': return rotateSignal(last & ~16, 3) | (last & 16 ? 0 : 16);
  }
}

export function signalDescription(mask: number, size: number): string {
  const lights = Array.from({ length: size * size }, (_, i) => i).filter(i => mask & (1 << i));
  return lights.length ? lights.map(i => `row ${Math.floor(i / size) + 1} column ${i % size + 1}`).join('; ') : 'no lights';
}

export type SignalState = { phase: 'intro' | 'playing' | 'feedback' | 'finished'; run: number; round: number; score: number; answer: number | null };
export type SignalAction = { type: 'start' } | { type: 'replay' } | { type: 'answer'; run: number; round: number; option: number } | { type: 'next'; run: number; round: number };
export const initialSignal = (): SignalState => ({ phase: 'intro', run: 0, round: 0, score: 0, answer: null });

export function signalStep(state: SignalState, action: SignalAction): SignalState {
  if (action.type === 'start' || action.type === 'replay') {
    if (action.type === 'start' ? state.phase !== 'intro' : state.phase !== 'finished') return state;
    return { ...initialSignal(), phase: 'playing', run: state.run + 1 };
  }
  if (action.run !== state.run || action.round !== state.round) return state;
  if (action.type === 'answer') {
    if (state.phase !== 'playing' || !Number.isInteger(action.option) || action.option < 0 || action.option > 2) return state;
    const puzzle = SIGNAL_PUZZLES[state.round];
    return { ...state, phase: 'feedback', answer: action.option, score: state.score + Number(puzzle.options[action.option] === expectedSignal(puzzle)) };
  }
  if (action.type !== 'next' || state.phase !== 'feedback') return state;
  return state.round === SIGNAL_PUZZLES.length - 1 ? { ...state, phase: 'finished' }
    : { ...state, phase: 'playing', round: state.round + 1, answer: null };
}

export const signalAccuracy = (state: SignalState): number => Math.round(state.score / SIGNAL_PUZZLES.length * 100);
