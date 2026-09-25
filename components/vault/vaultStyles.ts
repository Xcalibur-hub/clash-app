import { StyleSheet } from 'react-native';
import { accent, color, ink, layout, radius, space, typeScale } from '../../theme';

/** Vault screen chrome (§21): flat canvas + 8pt content gaps, no aurora. */
export const vault = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.lg, paddingBottom: space.xl },
  hero: { gap: 4, paddingTop: 4 },
  sub: { ...typeScale.body, fontSize: 14, color: ink.secondary },
});

/** Bottom-sheet chrome shared by the mock checkout + analytics paywall. */
export const sheet = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  box: { padding: space.lg, paddingBottom: space.xxl },
});

export const paySheet = StyleSheet.create({
  card: { gap: space.md },
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

export const checkout = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typeScale.cardTitle, color: ink.primary, letterSpacing: 0.6 },
  dropTitle: { ...typeScale.body, color: ink.secondary },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  method: {
    minWidth: '47%',
    flexGrow: 1,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 2,
  },
  methodActive: { borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.08)' },
  methodLabel: { ...typeScale.label, color: ink.secondary },
  on: { color: ink.primary },
  hint: { ...typeScale.meta, color: ink.tertiary, fontWeight: '400' },
  mockRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mockText: { ...typeScale.meta, color: ink.tertiary, flex: 1, fontWeight: '400' },
  done: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  tick: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(67,214,160,0.5)',
    backgroundColor: 'rgba(67,214,160,0.12)',
  },
  doneTitle: { ...typeScale.title, color: accent.mint },
  doneBody: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
});
