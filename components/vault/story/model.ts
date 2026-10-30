/** Original local fiction. Back removes the latest choice; revisiting erases that future. */
export type StoryState = { run: number; started: boolean; choices: readonly number[] };
export type StoryAction = { type: 'start' } | { type: 'reset' } | { type: 'back' }
  | { type: 'choose'; run: number; step: number; option: number };
export const initialStory = (): StoryState => ({ run: 0, started: false, choices: [] });
export function storyStep(s: StoryState, a: StoryAction): StoryState {
  if (a.type === 'start') return s.started ? s : { ...s, started: true };
  if (a.type === 'reset') return { run: s.run + 1, started: true, choices: [] };
  if (a.type === 'back') return s.choices.length ? { ...s, run: s.run + 1, choices: s.choices.slice(0, -1) }
    : s.started ? { ...s, started: false } : s;
  if (a.type !== 'choose' || !s.started || a.run !== s.run || a.step !== s.choices.length
    || s.choices.length >= 3 || !Number.isInteger(a.option) || a.option < 0 || a.option > 1) return s;
  return { ...s, choices: [...s.choices, a.option] };
}
export type StoryScene = { id: string; title: string; body: string[]; consequence?: string; options: readonly string[] };
export function storyScene(s: StoryState): StoryScene {
  const [evidence, chamber, transmission] = s.choices;
  if (!s.started) return {
    id: 'intro', title: 'The Last Signal', options: [], body: [
      'A fictional mystery in three decisions.',
      'Station Orison has been silent for eleven years. Tonight, a transmission arrives with your voice on it: “When you reach the chamber, do not answer me.”',
      'Your survey shuttle carries you to the abandoned station. One landing light still burns. Nobody has requested a rescue.',
      'Read at your own pace. Choices change what you learn and what survives. Nothing is saved or sent. Back revisits the previous decision and discards its future; leaving starts a new story next time.',
    ],
  };
  if (s.choices.length === 0) return {
    id: 'threshold', title: '01 / The voice at the door', options: ['Record the transmission', 'Answer with your name'], body: [
      'Inside the airlock, dust lies undisturbed around a warm receiver. Your voice repeats the warning. Beneath it, another voice counts down from twelve.',
      'The receiver has two controls: a recorder and an open microphone. The station has power for one first contact before it seals the line.',
    ],
  };
  if (s.choices.length === 1) return {
    id: `chamber-${evidence}`, title: '02 / Someone behind the glass',
    consequence: evidence === 0 ? 'You kept a record. The line closed before it learned your name.' : 'The station knows your name. The warning has stopped.',
    options: ['Open the life-support circuit', 'Isolate the chamber'], body: [
      evidence === 0
        ? 'Slowing the recording reveals two timestamps. The warning is eleven years old; the countdown is happening now. A buried phrase emerges: “I am not the voice. I am the person it kept.”'
        : 'Your name returns from every ceiling speaker. A figure presses a hand against the chamber glass. “Thank you,” it says in your voice. You cannot tell whether the lips move.',
      'The chamber holds a sleeping researcher, Mara, wired to the station’s prediction engine. Her wrist display shows a pulse. The engine has been borrowing her memories to keep its failing reactor alive.',
      'Opening life support may wake her, but gives the engine a route into your shuttle. Isolation protects the shuttle and leaves Mara dependent on the dying station.',
    ],
  };
  if (s.choices.length === 2) return {
    id: `uplink-${evidence}-${chamber}`, title: '03 / The last window',
    consequence: chamber === 0 ? 'Mara wakes. A second passenger appears on your shuttle manifest.' : 'The chamber seals. Only your recorder can cross the boundary now.',
    options: ['Transmit and depart', 'Stay and cut the uplink'], body: [
      chamber === 0 ? 'Mara remembers building the engine, but not the warning. She follows you toward the dock. Behind her, the station speaks with the voice of someone you have not met yet.'
        : 'Mara opens her eyes through the glass. She writes one word in the condensation: WITNESS. The shuttle is still clean, but she cannot board it.',
      evidence === 0 ? 'Your recording contains the engine’s original shutdown phrase. It can separate the borrowed voice from Mara, if you send it before the station loses power.'
        : 'There is no unaltered recording. The engine has braided your reply into every outgoing packet. You can carry the mystery home, or deny it a way out.',
      'The uplink offers one remaining burst. Transmitting will send whatever you have preserved to the rescue array. Staying means cutting the link by hand and becoming the station’s final caretaker.',
    ],
  };
  const guardian = transmission === 1;
  const rescue = !guardian && evidence === 0 && chamber === 0;
  return {
    id: guardian ? 'guardian' : rescue ? 'rescue' : 'echo',
    title: guardian ? 'The Keeper of Orison' : rescue ? 'Two Voices, One Dawn' : 'The Echo Arrives', options: [],
    consequence: guardian ? 'You chose containment over departure.' : rescue ? 'Evidence and compassion made a safe escape possible.' : 'Departure preserved a signal, but not a clean rescue.',
    body: guardian ? [
      'You pull the uplink breaker. For the first time in eleven years, the station is quiet.',
      chamber === 0 ? 'Mara stays beside you. Together you dismantle the engine one memory at a time. There are two people here now, and neither must imitate the other.'
        : 'Mara remains behind the glass. You feed power to her chamber from the shuttle, postponing your own departure. Saving her will be slower than answering a voice.',
      evidence === 0 ? 'You keep the recording for a rescue crew that may someday come. A warning can be evidence without becoming a command.'
        : 'You write your name on paper, where the engine cannot repeat it. Tomorrow you will learn Mara’s real voice.',
      'Outside, the landing light burns for someone else. You leave it on.',
    ] : rescue ? [
      'The shutdown phrase leaves your recorder. The extra passenger vanishes from the manifest. Mara speaks once, in a small, unfamiliar voice: “That one is mine.”',
      'The rescue array answers. You carry a living witness and an unaltered record home. Behind you, Orison’s borrowed voices fall silent.',
      'At dawn, Mara asks to hear the warning again. Neither of you speaks over it. Some mysteries are solved by listening before answering.',
    ] : [
      chamber === 0 ? 'Mara boards your shuttle. So does the voice threaded through the open circuit. Without an unaltered record, you cannot separate one passenger from the other.'
        : 'You leave alone. Mara’s pulse disappears from the remote display. The packet reaches the rescue array before the reactor goes dark.',
      evidence === 0 ? 'The archive preserves the truth of what happened, but a record cannot replace a person. A rescue team will know who was left behind.'
        : 'At the rescue array, a speaker welcomes you by name. It uses your voice. The engine has learned that a door can also be a person who answers.',
      'You reach home. The signal reaches farther. The mystery is no longer confined to Orison.',
    ],
  };
}
