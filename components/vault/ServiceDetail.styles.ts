import { StyleSheet } from 'react-native';
import { layout, radius, space, typeScale } from '../../theme';

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  hero: {
    minHeight: 260,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: 6,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,9,11,0.42)' },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(250,250,248,0.8)',
    letterSpacing: 1,
    zIndex: 1,
  },
  title: {
    ...typeScale.display,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#FAFAF8',
    zIndex: 1,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typeScale.cardTitle },
  handle: { ...typeScale.meta },
  body: { ...typeScale.body },
  meta: { ...typeScale.caption, letterSpacing: 0.4 },
  label: { ...typeScale.caption, letterSpacing: 0.6, marginTop: space.sm },
  input: {
    minHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space.md,
    ...typeScale.body,
    textAlignVertical: 'top',
  },
});
