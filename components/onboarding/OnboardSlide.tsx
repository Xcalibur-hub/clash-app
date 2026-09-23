import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { accent, glow, ink, radius, space, tint, typeScale } from '../../theme';
import { GlassCard } from '../shared/GlassCard';
import { Burst, Underline } from '../shared/Doodles';

export interface OnboardSlideProps {
  icon: LucideIcon;
  step: string;
  title: string;
  body: string;
  /** 'a' | 'b' | 'gold' accent for the icon plate. */
  tone: 'a' | 'b' | 'gold';
}

const TONE = { a: accent.a, b: accent.b, gold: accent.gold } as const;

/** One onboarding beat. Content is spec §5 verbatim. */
export function OnboardSlide({ icon: Icon, step, title, body, tone }: OnboardSlideProps): React.JSX.Element {
  const color = TONE[tone];
  return (
    <GlassCard level="regular" corner={radius.xxl} contentStyle={styles.card}>
      <View style={[styles.plate, { borderColor: color, backgroundColor: tint.neutralSoft }, glow(color, 20, 8, 0.35)]}>
        <Icon size={28} color={color} strokeWidth={2.2} />
        <Burst size={44} color={color} opacity={0.22} style={styles.burst} />
      </View>
      <Text allowFontScaling={false} style={styles.step}>
        {step}
      </Text>
      <View>
        <Text allowFontScaling={false} style={styles.title}>
          {title}
        </Text>
        <Underline size={132} style={styles.mark} />
      </View>
      <Text allowFontScaling={false} style={styles.body}>
        {body}
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg, padding: space.xxl },
  plate: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  burst: { position: 'absolute', top: -12, right: -12 },
  step: { ...typeScale.caption, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  mark: { position: 'absolute', bottom: -12, left: -4 },
  body: { ...typeScale.body, color: ink.secondary },
});
