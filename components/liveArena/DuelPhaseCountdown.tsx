import React from 'react';
import { AppState, Text, View } from 'react-native';
import type { ArenaRoom } from '../../services/liveArenaService';
import { phaseTimeLabel } from '../../utils/arenaPhaseClock';
import { VISUAL_COUNTDOWN_PAUSED } from '../../utils/decorativeMotion';
import { typeScale, useThemeColors } from '../../theme';

/** No animation, including with reduced motion. This never changes eligibility or phase. */
export function DuelPhaseCountdown({ room }: { room: ArenaRoom }): React.JSX.Element | null {
  const t = useThemeColors();
  const [, tick] = React.useState(0);
  const active = ['open', 'final_arguments', 'judging'].includes(room.phase) && room.duel?.status === 'open';
  React.useEffect(() => {
    if (!active || VISUAL_COUNTDOWN_PAUSED) return;
    const timer = setInterval(() => tick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const [invalidated, setInvalidated] = React.useState<ArenaRoom['timing'] | null>(null);
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', () => setInvalidated(room.timing));
    return () => subscription.remove();
  }, [room.timing]);
  if (!active) return null;
  const stale = invalidated === room.timing || room.timing?.phase !== room.phase;
  const label = phaseTimeLabel(room.timing, performance.now(), stale);
  return <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
    <Text accessible accessibilityLabel={label} style={[typeScale.body, { color: t.textSecondary }]}>{label}</Text>
    <Text style={[typeScale.caption, { color: t.textMuted }]}>Timing is approximate. The server confirms each phase.</Text>
  </View>;
}
