/**
 * Vault creators (spec §17, §26 — 6 creators, believable Indian handles).
 * Reputation / followers are status numbers; they never gate Arena content.
 */
import type { Creator } from '../store/types';

export const CREATORS: readonly Creator[] = [
  {
    id: 'c-maya',
    handle: 'TechWithMaya',
    name: 'Maya Rane',
    tint: '#FF6A3D',
    tagline: 'Deconstructing tech hype in Goa',
    reputation: 13_480,
    followers: 102_400,
    homeShare: 34,
  },
  {
    id: 'c-zoya',
    handle: 'zoya.frames',
    name: 'Zoya Khan',
    tint: '#A580FF',
    tagline: 'Cinema essays, shot on phone',
    reputation: 12_060,
    followers: 88_900,
    homeShare: 22,
  },
  {
    id: 'c-riya',
    handle: 'riya.calls.it',
    name: 'Riya Salgaonkar',
    tint: '#FF4D5E',
    tagline: 'Hot takes, cold receipts',
    reputation: 27_300,
    followers: 214_000,
    homeShare: 29,
  },
  {
    id: 'c-ishaan',
    handle: 'ishaan.builds',
    name: 'Ishaan Naik',
    tint: '#43D6A0',
    tagline: 'Campus startups, zero jargon',
    reputation: 6890,
    followers: 41_300,
    homeShare: 31,
  },
  {
    id: 'c-kabir',
    handle: 'kabir.plays',
    name: 'Kabir Sethi',
    tint: '#3D8BFF',
    tagline: 'Football tactics for everyone',
    reputation: 5240,
    followers: 36_800,
    homeShare: 18,
  },
  {
    id: 'c-tanvi',
    handle: 'tanvi.money',
    name: 'Tanvi Rao',
    tint: '#FFC861',
    tagline: 'Money habits for first jobs',
    reputation: 3980,
    followers: 28_500,
    homeShare: 27,
  },
];

export const CREATOR_BY_ID: Readonly<Record<string, Creator>> = Object.fromEntries(
  CREATORS.map((creator) => [creator.id, creator]),
);
