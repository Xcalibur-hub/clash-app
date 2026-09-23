/**
 * Vault drops (spec §18, §26 — 5 exclusive + public companions).
 * Exclusive prices are mock INR; unlocks are simulated locally.
 */
import type { Drop } from '../store/types';

export const DROPS: readonly Drop[] = [
  {
    id: 'd-maya-growth',
    creatorId: 'c-maya',
    title: 'How I actually grew to 100K followers',
    blurb: 'The posting system, hooks and retention loops — no guru talk.',
    tier: 'exclusive',
    price: 49,
    unlocks: 2814,
    rating: 4.9,
  },
  {
    id: 'd-maya-gear',
    creatorId: 'c-maya',
    title: 'My Goa desk setup under ₹25K',
    blurb: 'Every rupee tracked. Links, mistakes and what I would skip.',
    tier: 'public',
    price: 0,
    unlocks: 9320,
    rating: 4.7,
  },
  {
    id: 'd-zoya-script',
    creatorId: 'c-zoya',
    title: 'The 9-minute video essay script',
    blurb: 'Structure, pacing and the re-hook every 90 seconds.',
    tier: 'exclusive',
    price: 79,
    unlocks: 1932,
    rating: 4.8,
  },
  {
    id: 'd-riya-research',
    creatorId: 'c-riya',
    title: 'Receipts: how I research a hot take',
    blurb: 'Sources, screenshots and the correction policy.',
    tier: 'exclusive',
    price: 59,
    unlocks: 3410,
    rating: 4.9,
  },
  {
    id: 'd-ishaan-launch',
    creatorId: 'c-ishaan',
    title: 'Launching on campus with ₹0 budget',
    blurb: 'Posters, societies and the first 500 users playbook.',
    tier: 'exclusive',
    price: 39,
    unlocks: 1204,
    rating: 4.6,
  },
  {
    id: 'd-kabir-tactics',
    creatorId: 'c-kabir',
    title: 'Reading a low block in 10 minutes',
    blurb: 'Pause-and-point film room anyone can follow.',
    tier: 'exclusive',
    price: 49,
    unlocks: 986,
    rating: 4.7,
  },
  {
    id: 'd-tanvi-salary',
    creatorId: 'c-tanvi',
    title: 'First salary: the 50/30/20 Goa edition',
    blurb: 'Rent, fun and SIPs without spreadsheet dread.',
    tier: 'public',
    price: 0,
    unlocks: 5120,
    rating: 4.8,
  },
];

export function dropsForCreator(creatorId: string): Drop[] {
  return DROPS.filter((drop) => drop.creatorId === creatorId);
}
