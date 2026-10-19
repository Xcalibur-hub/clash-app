/**
 * Compact return history shared by Activity and the explicit local demo.
 *
 * One tappable row per Clash: authoritative state, the title only when access
 * still allows it, the bounded basis sentence, and a trailing verb. The whole
 * row is the touch target (>= 56dp), so the verb needs no hit area of its own
 * and several Clashes stay scannable without tall cards.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';
import {
  returnStateLabel,
  type ArenaReturnItem,
  type ReturnState,
} from '../../utils/arenaReturnVisits';
import { ArenaButton } from './ui/ArenaPrimitives';

const ROW_MIN_HEIGHT = 56;

/** Trailing verb: only an authoritative destination offers a jump. */
function actionVerb(item: ArenaReturnItem): string {
  if (!item.destination) return 'Refresh';
  if (item.state === 'SETTLED' || item.state === 'DRAW') return 'Result';
  if (item.state === 'CANCELLED') return 'History';
  return 'Open';
}

/** Never speaks a title that access checks withheld. */
function accessibilityFor(item: ArenaReturnItem): string {
  const lead = returnStateLabel[item.state];
  if (!item.destination) return `${lead}. Refresh activity`;
  return item.title
    ? `${lead}. ${item.title}. ${actionVerb(item)}`
    : `${lead}. ${actionVerb(item)}`;
}

export function ArenaReturnList({ items, loading, error, coverage, onOpen, onRefresh, busy = false }: {
  items: readonly ArenaReturnItem[]; loading?: boolean; error?: string | null; coverage: string;
  onOpen: (item: ArenaReturnItem) => void; onRefresh: () => void; busy?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  const [limit, setLimit] = React.useState(3);
  const tone = (state: ReturnState): string =>
    state === 'LIVE' || state === 'FINAL' || state === 'SETTLED' || state === 'DRAW'
      ? t.textPrimary
      : state === 'JUDGING' || state === 'PENDING'
        ? t.textSecondary
        : t.textMuted;

  return (
    <View style={styles.wrap}>
      <Text style={[arena.type.meta, { color: t.textSecondary }]}>{coverage}</Text>

      {loading ? (
        <Text accessibilityLiveRegion="polite" style={{ color: t.textMuted }}>
          Loading recent Clashes…
        </Text>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>{error}</Text>
          <ArenaButton label="Retry activity" onPress={onRefresh} style={styles.compactButton} />
        </View>
      ) : (
        <>
          {items.length === 0 ? (
            <Text style={[arena.type.body, { color: t.textSecondary }]}>
              No accessible Clashes in this recent window.
            </Text>
          ) : null}

          {items.slice(0, limit).map((item) => (
            <Pressable
              key={item.id}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={accessibilityFor(item)}
              accessibilityState={{ disabled: busy }}
              onPress={() => (item.destination ? onOpen(item) : onRefresh())}
              style={[styles.row, { borderBottomColor: t.border }, busy && styles.dim]}
            >
              <View style={styles.copy}>
                <View style={styles.stateRow}>
                  <View style={[styles.dot, { backgroundColor: tone(item.state) }]} />
                  <Text
                    numberOfLines={1}
                    style={[arena.type.eyebrow, styles.stateLabel, { color: t.textMuted }]}
                  >
                    {returnStateLabel[item.state]}
                  </Text>
                </View>
                {item.title ? (
                  <Text
                    numberOfLines={1}
                    style={[arena.type.label, styles.title, { color: t.textPrimary }]}
                  >
                    {item.title}
                  </Text>
                ) : null}
                <Text numberOfLines={1} style={[arena.type.meta, { color: t.textSecondary }]}>
                  {item.basis}
                </Text>
              </View>
              <View style={styles.action}>
                <Text style={[styles.verb, { color: t.textPrimary }]}>{actionVerb(item)}</Text>
                <Text style={[styles.chevron, { color: t.textMuted }]}>›</Text>
              </View>
            </Pressable>
          ))}

          {items.length > limit ? (
            <ArenaButton
              label="Show more recent Clashes"
              variant="tertiary"
              style={styles.compactButton}
              onPress={() => setLimit((n) => n + 3)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingBottom: 16 },
  errorBlock: { gap: 8, paddingVertical: 4 },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stateLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  action: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  verb: { fontSize: 13, fontWeight: '700' },
  chevron: { fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.45 },
  compactButton: { minHeight: 44 },
});
