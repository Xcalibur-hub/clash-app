/**
 * Country picker sheet surfaces (Explore E2.8).
 * Height and bottom padding are computed per viewport in the sheet itself —
 * see `utils/explorePickerLayout.ts`.
 */
import { StyleSheet } from 'react-native';

import { layout, radius, space, typeScale } from '../../theme';

export const countryPickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,11,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg,
    gap: space.sm,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.section, fontSize: 20, fontWeight: '800' },
  close: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    ...typeScale.body,
    fontSize: 16,
  },
  list: { flex: 1 },
  empty: { ...typeScale.caption, fontSize: 13, paddingVertical: space.md },
});
