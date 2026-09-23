import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { compact, formatReputation } from '../../utils/format';

export interface CountUpProps {
  value: number;
  durationMs?: number;
  /** Stagger entries in a ledger so the numbers land in sequence. */
  delayMs?: number;
  prefix?: string;
  compactMode?: boolean;
  /**
   * `true` (default) rolls from 0 — right for a reward reveal.
   * `false` starts at the value and only animates later changes — right for the
   * Arena header, where the balance should never flash back to zero.
   */
  animateOnMount?: boolean;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

const FRAME_MS = 16;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Numbers carry a lot of the emotion in CLASH: reputation gains, coin balances,
 * jury scores. This animates from the previous value to the next one and jumps
 * straight to the target when the OS asks for reduced motion (spec §34).
 */
export function CountUp({
  value,
  durationMs = 900,
  delayMs = 0,
  prefix = '',
  compactMode = false,
  animateOnMount = true,
  style,
  accessibilityLabel,
}: CountUpProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const startAt = reduced || !animateOnMount ? value : 0;
  const [display, setDisplay] = React.useState<number>(startAt);
  const fromRef = React.useRef<number>(startAt);

  React.useEffect(() => {
    const from = fromRef.current;
    if (reduced || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return undefined;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    const kickoff = setTimeout(() => {
      const startedAt = Date.now();
      timer = setInterval(() => {
        const ratio = Math.min((Date.now() - startedAt) / durationMs, 1);
        const eased = easeOutCubic(ratio);
        setDisplay(Math.round(from + (value - from) * eased));
        if (ratio >= 1) {
          fromRef.current = value;
          if (timer) clearInterval(timer);
        }
      }, FRAME_MS);
    }, delayMs);

    return () => {
      clearTimeout(kickoff);
      if (timer) clearInterval(timer);
    };
  }, [delayMs, durationMs, reduced, value]);

  const text = compactMode ? compact(display) : formatReputation(display);

  return (
    <Text
      allowFontScaling={false}
      style={style}
      accessibilityLabel={accessibilityLabel ?? `${prefix}${text}`}
    >
      {`${prefix}${text}`}
    </Text>
  );
}
