import { StyleSheet } from 'react-native';
import { typeScale } from '../../theme';

/** Floating charcoal drawer — ChatGPT-quality density, CLASH destinations. */
export const DRAWER_BG = '#2B2B2B';
export const DRAWER_BG_ELEVATED = '#333333';
export const DRAWER_TEXT = '#F5F5F5';
export const DRAWER_TEXT_MUTED = 'rgba(245,245,245,0.55)';
export const DRAWER_ICON = 'rgba(245,245,245,0.72)';
export const DRAWER_ROW_ACTIVE = 'rgba(255,255,255,0.08)';

export const sidebar = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scrimTouch: { flex: 1 },
  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingVertical: 18,
    paddingLeft: 14,
    paddingRight: 56,
  },
  panel: {
    flex: 1,
    maxWidth: 340,
    width: '100%',
    borderRadius: 28,
    backgroundColor: DRAWER_BG,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    gap: 8,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  brand: {
    ...typeScale.label,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: DRAWER_TEXT,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  identityText: { flex: 1, gap: 2 },
  name: {
    ...typeScale.bodyStrong,
    fontSize: 15,
    color: DRAWER_TEXT,
  },
  handle: {
    ...typeScale.meta,
    fontSize: 13,
    color: DRAWER_TEXT_MUTED,
  },
  navBlock: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rowActive: {
    backgroundColor: DRAWER_ROW_ACTIVE,
  },
  rowLabel: {
    ...typeScale.nav,
    color: DRAWER_TEXT,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
    marginHorizontal: 10,
  },
  footer: {
    marginTop: 'auto',
    gap: 4,
    paddingTop: 8,
  },
  version: {
    ...typeScale.meta,
    fontSize: 12,
    color: DRAWER_TEXT_MUTED,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  pressed: { opacity: 0.72 },
});
