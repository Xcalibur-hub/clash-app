import { StyleSheet } from 'react-native';
import { ink, layout, space, typeScale } from '../../theme';

/** Width of the top-bar side slots, so the CLASH title stays optically centred. */
export const HEADER_SLOT = 38;

/** Layout shared by the Clash screen and its "judgement recorded" interstitial. */
export const clashStyles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  errorWrap: { flex: 1, justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSlot: { width: HEADER_SLOT },
  title: { ...typeScale.title, letterSpacing: 3, color: ink.primary },
  contextRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  recordedInner: { gap: space.xs },
  recordedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  recordedTitle: { ...typeScale.cardTitle, color: ink.primary, flex: 1, lineHeight: 24 },
  recordedBody: { ...typeScale.body, color: ink.tertiary },
});
