import * as Haptics from 'expo-haptics';

/**
 * Haptics are best-effort: unsupported devices and the iOS low-power mode both
 * reject, and a rejected vibration must never surface to the user.
 */
function fire(run: () => Promise<void>): void {
  void run().catch(() => undefined);
}

/** Light tap — selection, tab switch, chip change. */
export function tap(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium press — starting a Clash, opening a card. */
export function press(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Heavy press — committing a judgement. */
export function judge(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** The verdict landing: win, loss, or an abstained ballot. */
export function notify(kind: 'success' | 'warning' | 'error'): void {
  const type =
    kind === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : kind === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  fire(() => Haptics.notificationAsync(type));
}
