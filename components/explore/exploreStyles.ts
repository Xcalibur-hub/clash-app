import { StyleSheet } from 'react-native';
import { card, ink, layout, radius, space, typeScale } from '../../theme';

/** Explore layout (PRD §15): flat shelves under a search field. */
export const exploreStyles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.lg },
  section: { gap: space.md },
  subtitle: { ...typeScale.body, color: ink.secondary },
  shelf: { gap: space.md },
  shelfCard: { width: 300 },
  hoodCard: { width: 280 },
  emptyPanel: {
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  emptyText: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
});
