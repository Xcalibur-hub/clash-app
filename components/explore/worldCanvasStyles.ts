import { StyleSheet } from 'react-native';
import { radius, space, typeScale } from '../../theme';

/** Shared chrome for both World visuals (globe and map). */
export const worldCanvasStyles = StyleSheet.create({
  wrap: { gap: space.xs, alignItems: 'center' },
  mapFrame: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  hint: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
