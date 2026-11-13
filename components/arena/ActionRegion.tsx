import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { AppText } from '../shared/AppText';
import {
  primaryRoomAction,
  type RoomAction,
  type RoomActionTarget,
  type RoomPhase,
  type ViewerStanding,
} from '../../utils/arenaRoomEligibility';

/**
 * The one thing you may do right now — or a sentence explaining why there isn't.
 *
 * ## The defect this replaces
 *
 * Phase 2 mounted this region with a "Cast your verdict" button whose handler was
 * `if (action === 'vote') { return; }`. Tapping the most prominent control on the
 * screen did nothing at all. It also advertised ballots to spectators, whom
 * `submit_arena_side_vote` refuses outright, and to debaters who had already
 * voted, which the server rejects with `side vote already recorded`.
 *
 * ## The rule now
 *
 * The region is a pure projection of `primaryRoomAction()` — the same function the
 * unit tests exercise and the same one the screen uses to decide what to mount.
 * It can therefore only present an action the database would accept:
 *
 *   · enabled  → a real control, and `onAction` must end somewhere that performs it
 *   · disabled → **no button at all**; a short sentence instead
 *
 * `target` names the surface that owns the action (`composer`, `join_sheet`,
 * `auth`), so the screen cannot wire the CTA to a no-op without the `target`
 * being visibly wrong.
 *
 * ## Why there is no "cast your verdict" here
 *
 * There used to be one, and its only job was `scrollToEnd()` — which, on an
 * inverted list, scrolls away from the judging panel it was meant to reveal. The
 * panel is mounted permanently and contains the real ballot, so a second control
 * could only be a duplicate or a decoy. The model now returns a sentence naming
 * the panel instead, and this component renders that sentence.
 */
export interface ActionRegionProps {
  phase: RoomPhase;
  standing: ViewerStanding;
  /** True while a related request is in flight. */
  busy?: boolean;
  /**
   * Perform the offered action. Called only when the offer is enabled, and always
   * with a non-null target.
   */
  onAction: (action: Exclude<RoomAction, 'none'>, target: RoomActionTarget) => void;
}

export function ActionRegion({ phase, standing, busy = false, onAction }: ActionRegionProps): React.JSX.Element | null {
  const t = useThemeColors();
  const offer = primaryRoomAction(phase, standing);

  // Nothing to say and nothing to do: no region, no hole. This only happens if the
  // caller passes a phase the model treats as silent, which it currently never
  // does — kept as a guard rather than an assumption.
  if (!offer.enabled && !offer.reason) return null;

  // A disabled offer is a sentence, not a button. This is the core of blocker 1:
  // a greyed-out control still reads as "something should happen here".
  if (!offer.enabled) {
    return (
      <View style={styles.wrap}>
        <AppText style={[typeScale.meta, styles.reason, { color: t.textMuted }]}>
          {offer.reason}
        </AppText>
      </View>
    );
  }

  const target = offer.target;
  // `primaryRoomAction` guarantees a target whenever `enabled` is true; this
  // narrows it for the type checker without asserting at the call site.
  if (target === null) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onAction(offer.action as Exclude<RoomAction, 'none'>, target)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={offer.label}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: busy ? t.surfaceMuted : t.textPrimary,
            opacity: pressed && !busy ? 0.92 : 1,
          },
        ]}
      >
        <AppText style={[typeScale.button, { color: busy ? t.textMuted : t.background }]}>
          {offer.label}
        </AppText>
      </Pressable>
      {/* A reason alongside an enabled action is context, not a block. */}
      {offer.reason ? (
        <AppText style={[typeScale.meta, styles.reason, { color: t.textMuted }]}>{offer.reason}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  reason: { textAlign: 'center' },
});
