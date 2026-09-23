import { StyleSheet } from 'react-native';
import { accent, color, ink, radius, space, typeScale } from '../../theme';

/** Vault screen chrome: shared padding + hero + premium section gaps. */
export const vault = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 14, paddingBottom: 26 },
  hero: { gap: 4, paddingTop: 4 },
  eyebrow: { ...typeScale.caption, color: accent.gold },
  title: { ...typeScale.title, color: ink.primary, letterSpacing: -0.4 },
  sub: { ...typeScale.body, color: ink.secondary, fontSize: 14 },
});

/** Sponsor dashboard (spec §22): tab row + simulated-data label. */
export const sponsorRow = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: {
    ...typeScale.caption,
    color: ink.tertiary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  tabActive: { color: ink.primary, borderColor: 'rgba(255,200,97,0.55)' },
  sim: { ...typeScale.meta, color: ink.tertiary },
});

/** Bottom-sheet chrome shared by the mock checkout + analytics paywall. */
export const sheet = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  box: { padding: space.lg, paddingBottom: space.xxl },
});

export const paySheet = StyleSheet.create({
  card: { gap: space.md },
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
  methodActive: { borderColor: 'rgba(255,200,97,0.55)', backgroundColor: 'rgba(255,200,97,0.10)' },
  methodLabel: { ...typeScale.label, color: ink.secondary },
  on: { color: accent.gold },
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
