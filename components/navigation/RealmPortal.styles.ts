import { StyleSheet } from 'react-native';
import { color, ink, typeScale } from '../../theme';

export const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  ring: { position: 'absolute', width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 220, height: 220, borderRadius: 110, borderWidth: 1.5, opacity: 0.8 },
  core: { position: 'absolute', width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  coreInner: { width: 64, height: 64, borderRadius: 32, opacity: 0.5 },
  word: { alignItems: 'center', gap: 6 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  title: { ...typeScale.display, color: ink.primary },
});
