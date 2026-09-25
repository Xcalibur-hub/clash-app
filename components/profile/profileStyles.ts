import { StyleSheet } from 'react-native';
import { color, layout, space } from '../../theme';

/** Layout for the Profile screen (kept out of the screen for readability). */
export const profileStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  rep: { padding: space.lg },
});