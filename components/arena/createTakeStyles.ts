import { StyleSheet } from 'react-native';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';

/** Layout for Take Creation (spec §7), kept out of the screen for readability. */
export const createTakeStyles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  inputWrap: { gap: space.xs, marginTop: space.sm },
  input: {
    ...typeScale.take,
    color: ink.primary,
    minHeight: 168,
    padding: layout.cardPadding,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.fill,
    textAlignVertical: 'top',
    lineHeight: 26,
  },
  inputOver: { borderColor: accent.danger },
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  counter: { ...typeScale.data, fontSize: 12, color: ink.tertiary },
  counterOver: { color: accent.danger },
  sectionLabel: { ...typeScale.eyebrow, color: ink.tertiary, marginTop: space.xs },
  footer: { gap: space.md, paddingTop: space.sm, alignItems: 'center' },
  cta: { alignSelf: 'stretch' },
  disclaimer: { ...typeScale.caption, color: ink.tertiary },
});
