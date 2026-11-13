import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { AppText } from '../shared/AppText';
import {
  permittedAction,
  permittedActionLabel,
  type ArenaHierarchyInput,
  type PermittedAction,
} from '../../utils/arenaHierarchy';

/**
 * The one thing you may do right now.
 *
 * ## Why a dedicated region
 *
 * In the old room screen the permitted action was wherever the composer happened
 * to sit: a text field pinned to the bottom for fighters, a "Join a side" bar for
 * spectators, a ballot buried in a sheet during judging. Nothing on screen said
 * *which* of those applied, and a spectator in JUDGING could not tell whether
 * their ballot had already been cast.
 *
 * This region states the action in the second person, above the content it acts
 * on, and is the only filled element on the screen. It renders nothing when there
 * is nothing to do — an empty reservation would read as a broken control.
 *
 * The region never invents capability: it is driven by `permittedAction()`, the
 * same pure function the tests exercise and the same one the screens use to
 * decide what to mount. A disabled state is only shown when the server has
 * already told us the action is unavailable (`reason`).
 */
export interface ActionRegionProps extends ArenaHierarchyInput {
  /** Why the action is unavailable, when the server says it is. */
  reason?: string | null;
  /** True while an action is in flight — shows the label dimmed, not a spinner. */
  busy?: boolean;
  onPress: (action: PermittedAction) => void;
}

export function ActionRegion({
  reason,
  busy = false,
  onPress,
  ...input
}: ActionRegionProps): React.JSX.Element | null {
  const t = useThemeColors();
  const action = permittedAction(input);

  // Nothing to offer: no region, no hole.
  if (action === 'none' || action === 'watch') return null;

  const label = permittedActionLabel(action);
  const disabled = Boolean(reason) || busy;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onPress(action)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={reason ?? undefined}
        accessibilityState={{ disabled, busy }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: disabled ? t.surfaceMuted : t.textPrimary,
            opacity: pressed && !disabled ? 0.92 : 1,
          },
        ]}
      >
        <AppText style={[typeScale.button, { color: disabled ? t.textMuted : t.background }]}>
          {label}
        </AppText>
      </Pressable>
      {/*
        The reason is stated in words rather than implied by a greyed-out button.
        "Waiting for the other side" tells the user what to do; a dimmed pill does
        not.
      */}
      {reason ? (
        <AppText style={[typeScale.meta, styles.reason, { color: t.textMuted }]}>{reason}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.lg,
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
