/**
 * Style keys shared by more than one Explore surface.
 *
 * Seeded by step S1 (the SearchHub extraction): `rail` is used by both the Search Hub result rails
 * and the Explore screen's Live rail, so it is defined here exactly once instead of being copied.
 * Value is unchanged from its original definition in `app/(tabs)/explore.tsx`.
 */
import { StyleSheet } from 'react-native';
import { layout, space } from '../../theme';

export const sharedExploreStyles = StyleSheet.create({
  rail: { gap: space.xs, paddingRight: layout.screenX },
});
