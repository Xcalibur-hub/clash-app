import { StyleSheet } from 'react-native';
import { card, ink, radius, space, typeScale } from '../../theme';

/** Layout for the verdict reveal — flat dark tokens only (reference screen 9). */
export const resultStyles = StyleSheet.create({
  rewards: { gap: space.lg },
  alignmentRow: { gap: space.sm, alignItems: 'flex-start' },
  alignmentText: { ...typeScale.body, color: ink.secondary },
  rankCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
    padding: space.lg,
  },
});
