import { StyleSheet } from 'react-native';
import { ink, layout, space, typeScale } from '../../theme';

/** Layout for the Profile screen (kept out of the screen for readability). */
export const profileStyles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { ...typeScale.title, letterSpacing: 3, color: ink.primary },
  rep: { padding: space.lg },
});