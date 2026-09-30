/** Onboarding stage copy — short product demos, not essays. */

export interface OnboardingStage {
  key: 'say' | 'challenge' | 'judge';
  headline: string;
  support: string;
}

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    key: 'say',
    headline: 'SAY IT.',
    support: 'Post the opinion everyone\nis already thinking.',
  },
  {
    key: 'challenge',
    headline: 'CHALLENGE IT.',
    support: "Think they're wrong?\nMake your case.",
  },
  {
    key: 'judge',
    headline: 'JUDGE IT.',
    support: 'The community decides\nwhich argument holds up.',
  },
] as const;
