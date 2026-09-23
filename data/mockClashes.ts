import { TAKES } from './mockTakes';
import type { Clash } from '../store/types';
import { selectJurors } from '../services/juryService';

/**
 * One live Clash per Take. Jurors and the settled tally come from the mock jury
 * engine so the Arena, the Clash screen and the result screen all agree.
 */
interface ClashSeed {
  takeId: string;
  challengerId: string;
  challengerText: string;
  engagement: number;
}

const SEEDS: readonly ClashSeed[] = [
  {
    takeId: 't-pixel',
    challengerId: 'u-liam',
    challengerText: "Photos aren't the whole story. iPhone still dominates video.",
    engagement: 412,
  },
  {
    takeId: 't-flagship',
    challengerId: 'u-liam',
    challengerText: 'Caught up on specs, still behind on resale value.',
    engagement: 268,
  },
  {
    takeId: 't-trailers',
    challengerId: 'u-maya',
    challengerText: 'Trailers are marketing. Nobody is watching AI for two hours.',
    engagement: 1530,
  },
  {
    takeId: 't-degree',
    challengerId: 'u-ananya',
    challengerText: 'The degree is a visa for your first job. Try skipping it.',
    engagement: 690,
  },
  {
    takeId: 't-monsoon',
    challengerId: 'u-zoya',
    challengerText: 'December Goa is crowded because it is actually good.',
    engagement: 355,
  },
  {
    takeId: 't-matchmaking',
    challengerId: 'u-neel',
    challengerText: 'Without ranked I have no reason to queue twice.',
    engagement: 388,
  },
  {
    takeId: 't-distribution',
    challengerId: 'u-viewer',
    challengerText: 'Bad product kills more startups than bad marketing.',
    engagement: 141,
  },
  {
    takeId: 't-highlights',
    challengerId: 'u-kabir',
    challengerText: 'Highlights delete the tension that makes football football.',
    engagement: 705,
  },
  {
    takeId: 't-iphone-price',
    challengerId: 'u-maya',
    challengerText: 'You are paying for the support cycle, not the hardware sheet.',
    engagement: 940,
  },
  {
    takeId: 't-viewer-sleep',
    challengerId: 'u-tanvi',
    challengerText: 'Busy is not the same as productive, but the apps do help.',
    engagement: 122,
  },
  {
    takeId: 't-viewer-placements',
    challengerId: 'u-riya',
    challengerText: 'The campus network still decides the first offer.',
    engagement: 205,
  },
];

/** The challenger answers 25 minutes after the take lands. */
const RESPONSE_DELAY = 25 * 60_000;

export const CLASHES: readonly Clash[] = SEEDS.map((seed) => {
  const take = TAKES.find((item) => item.id === seed.takeId);
  const createdAt = (take?.createdAt ?? Date.now()) + RESPONSE_DELAY;
  const id = `clash-${seed.takeId}`;
  // The two debaters are never seated on their own jury (spec §9).
  const jurors = selectJurors(id, {
    excludeUserIds: take ? [take.authorId, seed.challengerId] : [seed.challengerId],
  });
  return {
    id,
    takeId: seed.takeId,
    challengerId: seed.challengerId,
    challengerText: seed.challengerText,
    createdAt,
    jurors,
    engagement: seed.engagement,
  };
});
