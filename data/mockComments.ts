import type { ChallengerComment } from '../store/types';

const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

function row(
  id: string,
  takeId: string,
  authorId: string,
  text: string,
  upvotes: number,
  ageHours: number,
): ChallengerComment {
  return { id, takeId, authorId, text, upvotes, createdAt: NOW - ageHours * HOUR };
}

/**
 * Community rebuttals (2 per take). Top-voted comment per take mirrors
 * the challenger text in mockClashes.ts so Arena/Clash stay consistent.
 */
export const COMMENTS: readonly ChallengerComment[] = [
  row('c-pixel-1', 't-pixel', 'u-liam', "Photos aren't the whole story. iPhone still dominates video.", 214, 3),
  row('c-pixel-2', 't-pixel', 'u-zoya', 'Gcam port on Pixel still clears iPhone night mode for half the price.', 96, 2),
  row('c-flagship-1', 't-flagship', 'u-liam', 'Caught up on specs, still behind on resale value.', 158, 2),
  row('c-flagship-2', 't-flagship', 'u-maya', 'Trade-in counters disagree — Pixels hold better than they used to.', 71, 1),
  row('c-trailers-1', 't-trailers', 'u-maya', 'Trailers are marketing. Nobody is watching AI for two hours.', 402, 1.5),
  row('c-trailers-2', 't-trailers', 'u-kabir', 'Give it a year — short AI films already beat ad spots.', 133, 1),
  row('c-degree-1', 't-degree', 'u-ananya', 'The degree is a visa for your first job. Try skipping it.', 287, 4),
  row('c-degree-2', 't-degree', 'u-viewer', 'Skills get interviews, degrees get shortlists. You need both.', 112, 3),
  row('c-monsoon-1', 't-monsoon', 'u-zoya', 'December Goa is crowded because it is actually good.', 176, 5),
  row('c-monsoon-2', 't-monsoon', 'u-riya', 'Empty monsoon beaches beat Baga traffic any day.', 149, 4),
  row('c-matchmaking-1', 't-matchmaking', 'u-neel', 'Without ranked I have no reason to queue twice.', 198, 6),
  row('c-matchmaking-2', 't-matchmaking', 'u-ishaan', 'Casual lobbies died when everyone started try-harding ranked.', 84, 5),
  row('c-distribution-1', 't-distribution', 'u-viewer', 'Bad product kills more startups than bad marketing.', 121, 7),
  row('c-distribution-2', 't-distribution', 'u-tanvi', 'Nobody sees a great product with zero distribution either.', 77, 6),
  row('c-highlights-1', 't-highlights', 'u-kabir', 'Highlights delete the tension that makes football football.', 265, 8),
  row('c-highlights-2', 't-highlights', 'u-neel', 'Ninety minutes plus stoppage time is a luxury, not a habit.', 118, 7),
  row('c-iphone-price-1', 't-iphone-price', 'u-maya', 'You are paying for the support cycle, not the hardware sheet.', 311, 2),
  row('c-iphone-price-2', 't-iphone-price', 'u-aarav', 'Five years of updates is worth the premium alone.', 104, 1),
  row('c-sleep-1', 't-viewer-sleep', 'u-tanvi', 'Busy is not the same as productive, but the apps do help.', 89, 2),
  row('c-sleep-2', 't-viewer-sleep', 'u-zoya', 'Sleep beats streaks. The apps just document the burnout.', 63, 1),
  row('c-place-1', 't-viewer-placements', 'u-riya', 'The campus network still decides the first offer.', 142, 9),
  row('c-place-2', 't-viewer-placements', 'u-ananya', 'After the first job nobody asks your CGPA again.', 98, 8),
];
