import { StyleSheet } from 'react-native';
import { color, ink, layout, radius, space, typeScale } from '../../theme';

/** Vault home chrome (§21): flat canvas, quiet cards, data over decoration. */
export const home = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.lg, paddingBottom: space.xxl },
  head: { gap: space.xxs },
  brand: { ...typeScale.caption, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  section: { ...typeScale.section, color: ink.primary, marginTop: space.xs },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  linkText: { ...typeScale.bodyStrong, color: ink.primary },
});