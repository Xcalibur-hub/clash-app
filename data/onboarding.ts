import type { LucideIcon } from 'lucide-react-native';
import { ArenaIcon, CommentIcon, CrownIcon } from '../components/shared/icons';

export interface OnboardingSlide {
  key: string;
  icon: LucideIcon;
  step: string;
  title: string;
  body: string;
  tone: 'a' | 'b' | 'gold';
}

/** First-launch copy (spec §5). */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    key: 'say',
    icon: CommentIcon,
    step: '01 — SAY IT',
    title: 'Say what everyone is thinking.',
    body: 'Drop a take in seconds. No essay, no thread, no warm-up. It lives for 24 hours and then it is gone.',
    tone: 'a',
  },
  {
    key: 'clash',
    icon: ArenaIcon,
    step: '02 — DISAGREE',
    title: 'Clash with people who disagree.',
    body: 'Anyone can challenge your take. Nine independent jurors read both sides and decide who actually won.',
    tone: 'b',
  },
  {
    key: 'rank',
    icon: CrownIcon,
    step: '03 — BUILD IT',
    title: 'Build your reputation.',
    body: 'Wins convert into reputation, coins and rank. Takes expire — your standing in the Arena does not.',
    tone: 'gold',
  },
];
