import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export interface CountUpProps {
  value: number;
  durationMs?: number;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/** Integer count-up for Clash results — skips animation under Reduce Motion. */
export function CountUp({
  value,
  durationMs = 280,
  suffix = '',
  style,
  accessibilityLabel,
}: CountUpProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const [display, setDisplay] = React.useState(reduced ? value : 0);

  React.useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return undefined;
    }
    const start = Date.now();
    let frame = 0;
    const tick = (): void => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return (
    <Text allowFontScaling={false} style={style} accessibilityLabel={accessibilityLabel}>
      {display}
      {suffix}
    </Text>
  );
}
