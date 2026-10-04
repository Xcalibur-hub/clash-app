export type MeetMatchMode = 'ANYWHERE' | 'COUNTRY' | 'INTERESTS' | 'HOOD';

export type MeetChannel = 'TEXT' | 'VIDEO';

export type MeetHoodId =
  | 'techtakes'
  | 'campushustle'
  | 'goatalk'
  | 'movies'
  | 'gaming'
  | 'startups'
  | 'football';

export const MEET_MATCH_MODES: MeetMatchMode[] = [
  'ANYWHERE',
  'COUNTRY',
  'INTERESTS',
  'HOOD',
];

export const MEET_INTERESTS = [
  'Music',
  'Movies',
  'Sports',
  'Tech',
  'Art',
  'Food',
  'Travel',
  'Gaming',
] as const;

/** Seat A is always the WebRTC offerer — never both peers race. */
export function meetIsOfferer(seat: 'A' | 'B' | string | null | undefined): boolean {
  return seat === 'A';
}

export function meetChannelsCompatible(a: MeetChannel, b: MeetChannel): boolean {
  return a === b;
}
