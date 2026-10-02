import type { ChallengerComment, TakeMedia } from '../store/types';
import { gradient } from '../theme';

const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

/** Local-only Unsplash fixtures for offline Arena media reply previews. */
const FIXTURE_IMAGE: TakeMedia = {
  kind: 'image',
  caption: '',
  colors: gradient.violet,
  url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=800&fit=crop',
};

const FIXTURE_NESTED: TakeMedia = {
  kind: 'image',
  caption: '',
  colors: gradient.violet,
  url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=800&fit=crop',
};

const FIXTURE_VIDEO: TakeMedia = {
  kind: 'video',
  caption: '',
  colors: ['#0C0C10', '#1C1917'],
  url: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1280&h=720&fit=crop',
  duration: '0:12',
};

function row(
  id: string,
  takeId: string,
  authorId: string,
  text: string,
  upvotes: number,
  ageHours: number,
  extras?: { parentId?: string; media?: TakeMedia },
): ChallengerComment {
  return {
    id,
    takeId,
    authorId,
    text,
    upvotes,
    createdAt: NOW - ageHours * HOUR,
    ...(extras?.parentId ? { parentId: extras.parentId } : {}),
    ...(extras?.media ? { media: extras.media } : {}),
  };
}

/**
 * Community rebuttals — guest/offline fallback before hydration swaps in live Arena.
 * LOCAL-ONLY media reply examples live on the flagship take thread.
 */
export const COMMENTS: readonly ChallengerComment[] = [
  row('c-pixel-1', 't-pixel', 'u-liam', "Photos aren't the whole story. iPhone still dominates video.", 214, 3),
  row('c-pixel-2', 't-pixel', 'u-zoya', 'Gcam port on Pixel still clears iPhone night mode for half the price.', 96, 2),
  // LOCAL-ONLY: image reply + nested image + video reply on the flagship take.
  row('c-flagship-1', 't-flagship', 'u-liam', 'Sure they have.', 158, 2, { media: FIXTURE_IMAGE }),
  row('c-flagship-1n', 't-flagship', 'u-maya', 'literally this', 71, 1, {
    parentId: 'c-flagship-1',
    media: FIXTURE_NESTED,
  }),
  row('c-flagship-2', 't-flagship', 'u-maya', '', 42, 0.5, { media: FIXTURE_VIDEO }),
  // LOCAL-ONLY: GIF-shaped reply (Tenor-like URL used only in offline fixtures).
  row('c-flagship-gif', 't-flagship', 'u-liam', 'this energy', 28, 0.2, {
    media: {
      kind: 'gif',
      caption: '',
      colors: gradient.violet,
      url: 'https://media.tenor.com/images/placeholder/tenor.gif',
      gifProvider: 'tenor',
      gifExternalId: 'fixture1',
    },
  }),
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
