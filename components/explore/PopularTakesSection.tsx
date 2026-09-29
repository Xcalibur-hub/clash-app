import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import { fetchPopularTakes } from '../../services/searchService';
import { selectAuthor, useClash, type Take } from '../../store';
import { card, ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { FlameIcon } from '../shared/icons';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

/**
 * Popular takes (PRD §15): the live Arena ranked by real heat — clashes weigh
 * more than reactions, matching the server's `heat` column.
 */
export function PopularTakesSection(): React.JSX.Element | null {
  const router = useRouter();
  const { state } = useClash();
  const [takes, setTakes] = React.useState<Take[] | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchPopularTakes(6)
      .then((rows) => {
        if (active) setTakes(rows);
      })
      .catch(() => {
        if (active) setTakes([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!takes || takes.length === 0) return null;

  const open = (id: string): void => {
    hapticTap();
    router.push(`/take/${id}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="TRENDING" title="Popular takes" />
      <View style={styles.list}>
        {takes.map((take, index) => {
          const author = selectAuthor(state, take.authorId);
          return (
            <Pressable
              key={take.id}
              onPress={() => open(take.id)}
              accessibilityRole="button"
              accessibilityLabel={`Take by ${author?.handle ?? 'unknown'}`}
              style={styles.row}
            >
              <Text allowFontScaling={false} style={styles.index}>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <View style={styles.body}>
                <Text allowFontScaling={false} numberOfLines={2} style={styles.text}>
                  {take.text}
                </Text>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.meta}>
                  @{author?.handle ?? 'unknown'} · {HOOD_LABEL[take.hood]}
                </Text>
              </View>
              <View style={styles.heat}>
                <FlameIcon size={14} color={ink.tertiary} strokeWidth={2.2} />
                <Text allowFontScaling={false} style={styles.heatText}>
                  {compact(take.clashes * 3 + take.reactions)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  index: { ...typeScale.data, fontSize: 12, color: ink.quaternary },
  body: { flex: 1, gap: 2 },
  text: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  meta: { ...typeScale.meta, color: ink.tertiary },
  heat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatText: { ...typeScale.data, fontSize: 12, color: ink.tertiary },
});
