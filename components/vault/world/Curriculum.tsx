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
 * Masterclass curriculum — giant numerals, hairline rows, book TOC energy.
 */
export const Curriculum = React.memo(function Curriculum({
  items,
  onSelect,
}: CurriculumProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
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
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  index: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
    width: 56,
  },
  body: { flex: 1, gap: 3 },
  title: { ...typeScale.cardTitle, fontSize: 17, fontWeight: '700', letterSpacing: -0.25 },
  meta: { ...typeScale.caption, letterSpacing: 0.3 },
  done: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
