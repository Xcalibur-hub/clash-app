import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Hood } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { GlowButton } from '../shared/GlowButton';

export interface HoodHeaderProps {
  hood: Hood;
  memberCount: number | null;
  liveCount: number | null;
  joined: boolean;
  joining: boolean;
  onToggleJoin: () => void;
}

/** Compact community header — name, description, real counts, join, rules. */
export function HoodHeader({
  hood,
  memberCount,
  liveCount,
  joined,
  joining,
  onToggleJoin,
}: HoodHeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.name}>
        h/{hood.name}
      </Text>
      <Text allowFontScaling={false} style={styles.description}>
        {hood.description}
      </Text>
      <View style={styles.stats}>
        <Text allowFontScaling={false} style={styles.stat}>
          {memberCount === null ? 'Members unavailable' : `${compact(memberCount)} members`}
        </Text>
        <Text allowFontScaling={false} style={styles.dot}>
          ·
        </Text>
        <Text allowFontScaling={false} style={styles.stat}>
          {liveCount === null ? 'Live takes unavailable' : `${liveCount} live takes`}
        </Text>
      </View>
      <GlowButton
        label={joined ? 'Joined' : 'Join'}
        tone={joined ? 'ink' : 'light'}
        compact
        disabled={joining}
        onPress={onToggleJoin}
        style={styles.join}
      />
      <View style={styles.rules}>
        {hood.rules.map((rule, index) => (
          <Text allowFontScaling={false} key={rule} style={styles.rule} numberOfLines={1}>
            {`${index + 1}. ${rule}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  name: { ...typeScale.section, color: ink.primary },
  description: { ...typeScale.body, color: ink.secondary },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stat: { ...typeScale.meta, color: ink.tertiary },
  dot: { ...typeScale.meta, color: ink.quaternary },
  join: { alignSelf: 'flex-start', marginTop: space.xs },
  rules: { gap: 3, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rule: { ...typeScale.meta, fontSize: 13, color: ink.tertiary },
});
