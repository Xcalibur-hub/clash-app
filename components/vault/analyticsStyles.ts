import { StyleSheet } from 'react-native';
import { card, color, ink, layout, radius, space, typeScale } from '../../theme';

/** Sponsor analytics chrome (§22): neutral data rows, no gold dashboard glow. */
export const analytics = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.lg, paddingBottom: space.xxl },
  header: { paddingBottom: space.sm },
  title: { ...typeScale.title, color: ink.primary },
  subtitle: { ...typeScale.body, fontSize: 14, color: ink.secondary, marginTop: space.xxs },
  tabs: { flexDirection: 'row', gap: space.xs, paddingBottom: space.sm },
  tab: { paddingVertical: space.sm, paddingHorizontal: space.md },
  tabText: { ...typeScale.label, color: ink.tertiary, fontWeight: '500' },
  tabTextActive: { color: ink.primary, fontWeight: '700' },
  sectionTitle: { ...typeScale.section, color: ink.primary, marginTop: space.xs },
  simLabel: { ...typeScale.caption, color: ink.tertiary, textAlign: 'center' },
});

/** Geo-attribution block (§22): thin city bars + the mock-unlock gate. */
export const attribution = StyleSheet.create({
  heading: { ...typeScale.cardTitle, color: ink.primary },
  citySection: { gap: space.md },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cityName: { ...typeScale.body, fontSize: 14, color: ink.primary, width: 84 },
  cityBarContainer: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  cityBar: { height: '100%', backgroundColor: 'rgba(255,255,255,0.82)' },
  cityPercentage: { ...typeScale.data, color: ink.primary, width: 44, textAlign: 'right' },
  locked: {
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
    gap: space.md,
    alignItems: 'center',
  },
  lockedBody: { ...typeScale.body, fontSize: 14, color: ink.secondary, textAlign: 'center' },
  sim: { ...typeScale.meta, color: ink.tertiary, textAlign: 'center' },
  unlockButton: {
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    marginTop: space.sm,
  },
  unlockText: { ...typeScale.button, color: '#09090C' },
});