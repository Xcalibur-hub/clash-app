/**
 * One country-scoped challenge or treasure hunt inside the World panel.
 * 44dp row, single line title, explicit kind label for screen readers.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';
import { ArrowRightIcon } from '../shared/icons';

export interface WorldContentRowProps {
  kind: string;
  title: string;
  meta: string | null;
  onPress: () => void;
}

export function WorldContentRow({
  kind,
  title,
  meta,
  onPress,
}: WorldContentRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderTopColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${kind}: ${title}`}
    >
      <View style={styles.copy}>
        <Text allowFontScaling={false} style={[styles.kind, { color: t.textMuted }]}>
          {kind}
        </Text>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.title, { color: t.textPrimary }]}
        >
          {title}
        </Text>
      </View>
      {meta ? (
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {meta}
        </Text>
      ) : null}
      <ArrowRightIcon size={15} color={t.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 1 },
  kind: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  meta: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
