import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Hood } from '../../store';
import { accent, card, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';

export interface HoodRowProps {
  position: number;
  hood: Hood;
  /** When set, the row becomes a press target that opens the hood. */
  onPress?: () => void;
  label?: string;
  /** Trending ribbon shown in the Hoods directory (reference screen 12). */
  tag?: string;
}

/** One hood on the Hall of Fame hoods leaderboard (or the Hoods directory). */
export function HoodRow({ position, hood, onPress, label, tag }: HoodRowProps): React.JSX.Element {
  const content = (
    <>
      <Text allowFontScaling={false} style={styles.position}>
        {`#${String(position).padStart(2, '0')}`}
      </Text>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
            {hood.name}
          </Text>
          {tag ? (
            <Text allowFontScaling={false} style={styles.tag}>
              {tag}
            </Text>
          ) : null}
        </View>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          {hood.tagline}
        </Text>
      </View>
      <View style={styles.stat}>
        <Text allowFontScaling={false} style={styles.value}>
          {formatReputation(hood.members)}
        </Text>
        <Text allowFontScaling={false} style={styles.label}>
          MEMBERS
        </Text>
      </View>
      <View style={styles.stat}>
        <Text allowFontScaling={false} style={styles.value}>
          {String(hood.liveClashes)}
        </Text>
        <Text allowFontScaling={false} style={styles.label}>
          LIVE
        </Text>
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? `Open ${hood.name}`}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  position: { ...typeScale.data, fontSize: 12, color: ink.quaternary },
  info: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { ...typeScale.label, color: ink.primary, fontWeight: '700', flexShrink: 1 },
  tag: { ...typeScale.caption, fontSize: 9, letterSpacing: 1, color: accent.gold },
  meta: { ...typeScale.meta, color: ink.tertiary },
  stat: { alignItems: 'flex-end', gap: 1 },
  value: { ...typeScale.data, fontSize: 12, color: ink.primary },
  label: { ...typeScale.caption, fontSize: 8, letterSpacing: 1, color: ink.quaternary },
});
