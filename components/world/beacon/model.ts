/** Original fictional island. No coordinates, clocks, persistence or service contracts. */
export const STOPS = [
  { id: 'steps', name: 'Tide Steps', note: 'A stairway descends into a vanished harbour. A rope runs uphill, away from the water.' },
  { id: 'house', name: 'Lens House', note: 'The lantern is cold. Its brass housing has been turned away from the sea, deliberately.' },
  { id: 'loft', name: 'Relay Loft', note: 'A hand-powered transmitter waits beneath the rafters. Someone left the dial between two coloured bands.' },
] as const;
export type StopId = typeof STOPS[number]['id'];
export const CLUES = [
  { id: 'tide', stop: 'steps', key: true, action: 'Examine tide plate', title: 'Flooded approach', detail: 'The plate marks the harbour crossing as submerged. Sending a traveller toward the sea would lead into deep water.' },
  { id: 'rope', stop: 'steps', key: false, action: 'Follow rope marks', title: 'An uphill trail', detail: 'Fresh rope grooves lead toward the island centre. Whoever left the harbour carried supplies rather than fleeing empty-handed.' },
  { id: 'notebook', stop: 'house', key: true, action: 'Read keeper notebook', title: 'The inland refuge', detail: 'The keeper wrote: “When the crossing floods, turn the beam inland. The old refuge has room for everyone.”' },
  { id: 'register', stop: 'house', key: false, action: 'Open visitor register', title: 'Nobody left behind', detail: 'Every visitor is checked into the refuge. The keeper stayed behind only to move the beacon, not to wait for a boat.' },
  { id: 'dial', stop: 'loft', key: true, action: 'Inspect relay dial', title: 'Amber carries inland', detail: 'The relay diagram pairs amber with the refuge receiver. Blue is the old sea channel; it cannot wake the inland lamp.' },
  { id: 'strip', stop: 'loft', key: false, action: 'Read maintenance strip', title: 'A deliberate silence', detail: 'The transmitter was unplugged while its beam was moved. There was no mysterious disappearance: the safe route simply went dark.' },
] as const;
export type ClueId = typeof CLUES[number]['id'];
export type BeaconState = { run: number; phase: 'intro' | 'field' | 'complete'; stop: StopId | null;
  found: readonly ClueId[]; beam: 'sea' | 'refuge'; band: 'blue' | 'amber'; outcome: 'restored' | 'misdirected' | 'silent' | null };
export type BeaconAction = { type: 'start' } | { type: 'reset' } | { type: 'back' } | { type: 'beam' }
  | { type: 'band' } | { type: 'pulse' } | { type: 'visit'; stop: StopId } | { type: 'inspect'; clue: ClueId; run: number };
export const initialBeacon = (): BeaconState => ({ run: 0, phase: 'intro', stop: null, found: [], beam: 'sea', band: 'blue', outcome: null });
export const beaconReady = (s: BeaconState): boolean => CLUES.filter(c => c.key).every(c => s.found.includes(c.id));
export function beaconStep(s: BeaconState, a: BeaconAction): BeaconState {
  if (a.type === 'reset') return { ...initialBeacon(), run: s.run + 1, phase: 'field' };
  if (a.type === 'start') return s.phase === 'intro' ? { ...s, phase: 'field' } : s;
  if (a.type === 'back') return s.phase === 'complete' || s.stop ? { ...s, phase: 'field', stop: null, outcome: null } : s;
  if (s.phase !== 'field') return s;
  if (a.type === 'visit') return STOPS.some(p => p.id === a.stop) ? { ...s, stop: a.stop } : s;
  if (a.type === 'inspect') {
    const clue = CLUES.find(c => c.id === a.clue);
    return a.run === s.run && clue?.stop === s.stop && !s.found.includes(a.clue)
      ? { ...s, found: [...s.found, a.clue] } : s;
  }
  if (s.stop || !beaconReady(s)) return s;
  if (a.type === 'beam') return { ...s, beam: s.beam === 'sea' ? 'refuge' : 'sea' };
  if (a.type === 'band') return { ...s, band: s.band === 'blue' ? 'amber' : 'blue' };
  if (a.type === 'pulse') return { ...s, phase: 'complete', outcome: s.beam === 'sea' ? 'misdirected' : s.band === 'blue' ? 'silent' : 'restored' };
  return s;
}
export function beaconOutcome(s: BeaconState): { title: string; body: string } {
  if (s.outcome === 'restored') return { title: 'A light at the refuge', body: s.found.length === CLUES.length
    ? 'The amber lamp answers from inland. Your complete record explains the silence: the keeper moved everyone to safety, then disconnected the beacon while turning it. You have restored the route and recovered the whole story.'
    : 'The amber lamp answers from inland. You used the flooded approach, the keeper’s direction and the relay band to restore a safe route. Other traces on the island can still explain why the beacon went silent.' };
  if (s.outcome === 'misdirected') return { title: 'Light over deep water', body: 'The pulse points toward the submerged harbour. Your tide-plate record warned that this approach was unsafe. No traveller is sent: this was a local simulation. Revisit your evidence and turn the beam inland.' };
  if (s.outcome === 'silent') return { title: 'The right path, no reply', body: 'The beam points inland, but the blue sea band cannot wake the refuge receiver. The relay-dial record identifies the missing connection. Return to the island and tune the amber band.' };
  return { title: 'No transmission yet', body: 'Investigate the island before reconstructing the beacon. There is no completed outcome to show.' };
}
