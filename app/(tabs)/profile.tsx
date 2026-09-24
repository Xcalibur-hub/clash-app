import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { Notice } from '../../components/shared/Notice';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { Avatar } from '../../components/shared/Avatar';
import { selectViewerTakes, selectViewerWins, useClash } from '../../store';
import { useClock } from '../../hooks/useClock';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';

type ProfileTab = 'takes' | 'wins' | 'hof';

const TABS: readonly SegmentedTab<ProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
  { key: 'hof', label: 'Hall of Fame' },
];

/** Simplified PROFILE with large avatar, clean metrics, and minimalist tabs. */
export default function ProfileScreen(): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<ProfileTab>('takes');
  const now = useClock();
  const viewer = state.viewer;
  const takes = React.useMemo(
    () => selectViewerTakes(state).filter((take) => take.expiresAt > now),
    [now, state],
  );
  const wins = React.useMemo(() => selectViewerWins(state), [state]);
  const immortal = React.useMemo(
    () =>
      HOF_ENTRIES.filter((entry) =>
        state.takes.some((take) => take.id === entry.takeId && take.authorId === viewer.id),
      ),
    [state.takes, viewer.id],
  );

  const winRate = state.viewer.clashes > 0 
    ? Math.round((state.viewer.wins / state.viewer.clashes) * 100) 
    : 0;

  return (
    <AuroraBackground tone="calm">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: space.xxl },
        ]}
      >
        {/* Large avatar + @handle + rank pill */}
        <View style={styles.hero}>
          <Avatar name={viewer.name} tint={viewer.tint} size={80} />
          <View style={styles.heroText}>
            <Text allowFontScaling={false} style={styles.handle}>
              @{viewer.handle}
            </Text>
            <Chip label={viewer.rank} tone="a" />
          </View>
        </View>

        {/* Clean 4-column metric row */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text allowFontScaling={false} style={styles.metricValue}>
              {formatReputation(viewer.reputation)}
            </Text>
            <Text allowFontScaling={false} style={styles.metricLabel}>
              Reputation
            </Text>
          </View>
          <View style={styles.metric}>
            <Text allowFontScaling={false} style={styles.metricValue}>
              {viewer.wins}
            </Text>
            <Text allowFontScaling={false} style={styles.metricLabel}>
              Wins
            </Text>
          </View>
          <View style={styles.metric}>
            <Text allowFontScaling={false} style={styles.metricValue}>
              {viewer.clashes}
            </Text>
            <Text allowFontScaling={false} style={styles.metricLabel}>
              Clashes
            </Text>
          </View>
          <View style={styles.metric}>
            <Text allowFontScaling={false} style={styles.metricValue}>
              {winRate}%
            </Text>
            <Text allowFontScaling={false} style={styles.metricLabel}>
              Win Rate
            </Text>
          </View>
        </View>

        {/* Minimalist segmented tabs */}
        <SegmentedTabs
          value={tab}
          items={TABS}
          onChange={setTab}
          label="Profile tabs"
        />

        {/* Tab content */}
        <View style={styles.tabContent}>
          {tab === 'takes' && (
            <View style={styles.tabSection}>
              <Text allowFontScaling={false} style={styles.tabCount}>
                {takes.length} live takes
              </Text>
              {takes.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyText}>
                  No active takes. Create one to start the debate.
                </Text>
              ) : (
                takes.map((take) => (
                  <View key={take.id} style={styles.takeItem}>
                    <Text allowFontScaling={false} style={styles.takeText}>
                      {take.text}
                    </Text>
                    <Text allowFontScaling={false} style={styles.takeMeta}>
                      {take.clashes} clashes · {take.reactions} reactions
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'wins' && (
            <View style={styles.tabSection}>
              <Text allowFontScaling={false} style={styles.tabCount}>
                {wins.length} victories
              </Text>
              {wins.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyText}>
                  No wins yet. Keep judging to build your reputation.
                </Text>
              ) : (
                wins.map((win) => (
                  <View key={win.result.clashId} style={styles.takeItem}>
                    <Text allowFontScaling={false} style={styles.takeText}>
                      Won with {win.result.alignment} alignment
                    </Text>
                    <Text allowFontScaling={false} style={styles.takeMeta}>
                      +{win.result.reputation} reputation
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'hof' && (
            <View style={styles.tabSection}>
              <Text allowFontScaling={false} style={styles.tabCount}>
                {immortal.length} immortal takes
              </Text>
              {immortal.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyText}>
                  No Hall of Fame entries yet. Create legendary takes.
                </Text>
              ) : (
                immortal.map((entry) => (
                  <View key={entry.id} style={styles.takeItem}>
                    <Text allowFontScaling={false} style={styles.takeText}>
                      {entry.winningSide === 'A' ? 'Side A' : 'Side B'} won {entry.scoreA}-{entry.scoreB}
                    </Text>
                    <Text allowFontScaling={false} style={styles.takeMeta}>
                      {entry.date}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  heroText: {
    flex: 1,
    gap: space.sm,
  },
  handle: {
    ...typeScale.title,
    color: ink.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    ...typeScale.cardTitle,
    color: ink.primary,
    fontWeight: '700',
  },
  metricLabel: {
    ...typeScale.subtitle,
    color: ink.subtitle,
  },
  tabContent: {
    marginTop: space.md,
  },
  tabSection: {
    gap: space.md,
  },
  tabCount: {
    ...typeScale.section,
    color: ink.primary,
  },
  emptyText: {
    ...typeScale.body,
    color: ink.secondary,
    textAlign: 'center',
    paddingVertical: space.xl,
  },
  takeItem: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
    gap: space.xs,
  },
  takeText: {
    ...typeScale.body,
    color: ink.primary,
  },
  takeMeta: {
    ...typeScale.subtitle,
    color: ink.subtitle,
  },
});
