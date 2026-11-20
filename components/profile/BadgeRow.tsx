import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { Badge, BadgeTier } from '../../store';
import { space } from '../../theme';
import { Chip } from '../shared/Chip';
import { FlameIcon, MedalIcon, ScaleIcon, ZapIcon } from '../shared/icons';

const TIER: Record<
  BadgeTier,
  { icon: LucideIcon; tone: 'a' | 'gold' | 'mint' | 'violet' }
> = {
  streak: { icon: FlameIcon, tone: 'a' },
  fame: { icon: MedalIcon, tone: 'gold' },
  early: { icon: ZapIcon, tone: 'violet' },
  jury: { icon: ScaleIcon, tone: 'mint' },
};

/** Earned badges (spec §15). Tiers map to a Lucide glyph + accent. */
export function BadgeRow({ badges }: { badges: readonly Badge[] }): React.JSX.Element {
  if (badges.length === 0) {
    return <View />;
  }
  return (
    <View style={styles.wrap}>
      {badges.map((badge) => {
        const meta = TIER[badge.tier];
        return <Chip key={badge.id} label={badge.label} icon={meta.icon} tone={meta.tone} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
