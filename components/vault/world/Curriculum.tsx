import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
import { LockIcon } from '../../shared/icons';
import { tap as hapticTap } from '../../../utils/haptics';

export interface CurriculumItem {
  id: string;
  title: string;
  meta?: string | null;
  locked?: boolean;
  done?: boolean;
}

export interface CurriculumProps {
  items: readonly CurriculumItem[];
  onSelect: (id: string) => void;
}

/**
 * A masterclass curriculum: large chapter numerals, editorial rows, hairline
 * separators. Reads like a book's table of contents, not a lesson marketplace.
 */
export const Curriculum = React.memo(function Curriculum({
  items,
  onSelect,
}: CurriculumProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={[styles.wrap, { borderColor: t.border }]}>
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          onPress={() => {
            hapticTap();
            onSelect(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={[styles.row, { borderColor: t.border }]}
        >
          <Text allowFontScaling={false} style={[styles.index, { color: t.textMuted }]}>
            {String(index + 1).padStart(2, '0')}
          </Text>
          <View style={styles.body}>
            <Text
              allowFontScaling={false}
              style={[styles.title, { color: item.locked ? t.textMuted : t.textPrimary }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {item.meta ? (
              <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                {item.meta}
              </Text>
            ) : null}
          </View>
          {item.locked ? <LockIcon size={15} color={t.textMuted} strokeWidth={2.2} /> : null}
          {item.done ? (
            <Text allowFontScaling={false} style={[styles.done, { color: t.textMuted }]}>
              DONE
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  index: {
    ...typeScale.data,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    width: 30,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typeScale.cardTitle, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  meta: { ...typeScale.caption, letterSpacing: 0.3 },
  done: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
