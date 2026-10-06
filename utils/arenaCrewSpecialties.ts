/**
 * Soft specialty tags for Arena Crews — matchmaking / discovery only.
 * Keep in sync with public.arena_crew_specialty_vocabulary().
 */
export const ARENA_CREW_SPECIALTIES = [
  'Tech',
  'Gaming',
  'Politics',
  'Sports',
  'Finance',
  'Science',
  'Movies',
  'Music',
  'Culture',
  'Cars',
  'History',
  'Design',
  'General',
] as const;

export type ArenaCrewSpecialty = (typeof ARENA_CREW_SPECIALTIES)[number];
