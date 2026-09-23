import { StyleSheet } from 'react-native';
import { accent, glow, ink, space, typeScale } from '../../theme';

/** Layout for the verdict reveal (reference screen 9). */
export const resultStyles = StyleSheet.create({
  wrap: { gap: space.lg, paddingTop: space.lg },
  headline: { alignItems: 'center', gap: space.xs },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  title: { ...typeScale.title, letterSpacing: 1.5, color: ink.primary, textAlign: 'center' },
  handle: { ...typeScale.meta, color: ink.secondary },
  scoreFooter: { alignItems: 'center' },
  rewards: { gap: space.lg },
  alignmentRow: { gap: space.sm, alignItems: 'flex-start' },
  alignmentText: { ...typeScale.body, color: ink.secondary },
  rankCard: { ...glow(accent.gold, 24, 8, 0.12) },
  continue: { alignSelf: 'stretch', marginTop: space.sm },
  sparkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center' },
  sparkText: { ...typeScale.meta, color: ink.tertiary },
});
