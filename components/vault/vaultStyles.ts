import { StyleSheet } from 'react-native';
import { color, ink, layout, space, typeScale } from '../../theme';

/** Vault screen chrome (§21): flat canvas + 8pt content gaps, no aurora. */
export const vault = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.lg, paddingBottom: space.xl },
  hero: { gap: 4, paddingTop: 4 },
  sub: { ...typeScale.body, fontSize: 14, color: ink.secondary },
});

/** Sponsor deep-link screen styles (kept out of the screen for readability). */
export const sponsorScreen = StyleSheet.create({
  center: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { ...typeScale.title, fontSize: 22, color: ink.primary },
  tabs: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  sim: { ...typeScale.meta, color: ink.tertiary },
  locked: { gap: space.sm },
  lockedTitle: { ...typeScale.cardTitle, color: ink.primary },
  lockedBody: { ...typeScale.body, color: ink.secondary },
});
