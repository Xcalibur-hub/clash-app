export type MeetMatchMode = 'ANYWHERE' | 'COUNTRY' | 'INTERESTS' | 'HOOD';

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
