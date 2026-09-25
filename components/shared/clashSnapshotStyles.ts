import { StyleSheet } from 'react-native';
import { accent, apple, ink, layout, radius, space, typeScale } from '../../theme';

/** Layout for the reusable clash snapshot card (Daily Drop). */
export const clashSnapshotStyles = StyleSheet.create({
  card: {
    backgroundColor: apple.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: apple.cardBorder,
    padding: layout.cardPadding,
    gap: space.md,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  number: { gap: space.xs },
  numberText: {
    ...typeScale.dataLg,
    fontSize: 22,
    color: accent.gold,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  label: { ...typeScale.eyebrow, color: ink.tertiary, flexShrink: 1 },
});