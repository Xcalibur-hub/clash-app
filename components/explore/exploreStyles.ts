import { StyleSheet } from 'react-native';
import { layout, space } from '../../theme';

/** Shared Explore layout tokens — sections own their theme-aware surfaces. */
export const exploreStyles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.lg },
  section: { gap: space.md },
  shelf: { gap: space.md },
});
