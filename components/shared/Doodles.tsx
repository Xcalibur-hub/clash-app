import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ink } from '../../theme';

/**
 * Hand-drawn editorial marks (spec §4). They are annotations, not decoration:
 * low opacity, thin strokes, never more than one or two per screen.
 */
interface DoodleProps {
  size?: number;
  color?: string;
  opacity?: number;
  style?: React.ComponentProps<typeof Svg>['style'];
}

export function Burst({ size = 34, color = ink.primary, opacity = 0.18, style }: DoodleProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" style={style}>
      <Path
        d="M20 3 L21.6 14.4 L31 7.6 L24.2 17 L36 20 L24.2 23 L31 32.4 L21.6 25.6 L20 37 L18.4 25.6 L9 32.4 L15.8 23 L4 20 L15.8 17 L9 7.6 L18.4 14.4 Z"
        fill={color}
        opacity={opacity}
      />
    </Svg>
  );
}

export function Squiggle({ size = 96, color = ink.primary, opacity = 0.22, style }: DoodleProps): React.JSX.Element {
  return (
    <Svg width={size} height={size * 0.28} viewBox="0 0 120 34" style={style}>
      <Path
        d="M3 22 C14 13 22 27 33 19 C44 11 50 25 62 18 C74 11 80 24 92 17 C102 11 110 16 117 12"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </Svg>
  );
}

export function ScribbleCircle({ size = 74, color = ink.primary, opacity = 0.2, style }: DoodleProps): React.JSX.Element {
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 80 50" style={style}>
      <Path
        d="M42 6 C22 2 6 11 5 24 C4 38 24 46 44 44 C62 42 76 34 74 22 C72 12 60 5 44 5 C34 5 22 8 15 14"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </Svg>
  );
}

export function ArrowMark({ size = 46, color = ink.primary, opacity = 0.22, style }: DoodleProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <Path
        d="M8 40 C14 26 22 16 38 9"
        stroke={color}
        strokeWidth={2.3}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
      <Path d="M27 8 L39 8 L38 20" stroke={color} strokeWidth={2.3} strokeLinecap="round" fill="none" opacity={opacity} />
    </Svg>
  );
}

export function Underline({ size = 120, color = ink.primary, opacity = 0.3, style }: DoodleProps): React.JSX.Element {
  return (
    <Svg width={size} height={12} viewBox="0 0 120 12" style={style}>
      <Path
        d="M3 8 C28 3 56 10 117 5"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </Svg>
  );
}
