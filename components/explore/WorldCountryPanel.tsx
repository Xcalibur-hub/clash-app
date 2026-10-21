/**
 * Selected-country panel: name, honest activity line, and only the challenges
 * and hunts the server actually returned for that country.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import {
  worldActivityLabel,
  worldContentCount,
  type WorldCountryContent,
} from '../../utils/exploreWorldModel';
import { CloseIcon, ArrowRightIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { WorldContentRow } from './WorldContentRow';

export interface WorldCountryPanelProps {
  code: string;
  name: string;
  activityCount: number | null;
  content: WorldCountryContent;
  onOpenCountry: (code: string) => void;
  onOpenChallenge: (id: string) => void;
  onOpenTreasure: (id: string) => void;
  onClear: () => void;
}

export function WorldCountryPanel({
  code,
  name,
  activityCount,
  content,
  onOpenCountry,
  onOpenChallenge,
  onOpenTreasure,
  onClear,
}: WorldCountryPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const openCount = worldContentCount(content);
  const meta =
    openCount > 0
      ? `${worldActivityLabel(activityCount)} · ${openCount} open`
      : worldActivityLabel(activityCount);

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(240)}
      style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
    >
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            {name}
          </Text>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {meta}
          </Text>
        </View>
        <Pressable
          onPress={onClear}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${name}`}
        >
          <CloseIcon size={17} color={t.textMuted} />
        </Pressable>
      </View>

      {content.challenges.slice(0, 2).map((challenge) => (
        <WorldContentRow
          key={challenge.id}
          kind="Challenge"
          title={challenge.title}
          meta={
            challenge.entryCount > 0
              ? `${challenge.entryCount} ${challenge.entryCount === 1 ? 'entry' : 'entries'}`
              : null
          }
          onPress={() => onOpenChallenge(challenge.id)}
        />
      ))}
      {content.treasures.slice(0, 2).map((treasure) => (
        <WorldContentRow
          key={treasure.id}
          kind="Treasure hunt"
          title={treasure.title}
          meta={
            treasure.giftsRemaining == null ? null : `${treasure.giftsRemaining} left`
          }
          onPress={() => onOpenTreasure(treasure.id)}
        />
      ))}
      {openCount === 0 ? (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          No challenge or hunt is open here yet.
        </Text>
      ) : null}

      <PressableScale
        onPress={() => onOpenCountry(code)}
        style={[styles.cta, { backgroundColor: t.textPrimary }]}
        accessibilityRole="button"
        accessibilityLabel={`Explore ${name}`}
      >
        <Text allowFontScaling={false} style={[styles.ctaText, { color: t.background }]}>
          Explore {name}
        </Text>
        <ArrowRightIcon size={16} color={t.background} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.xxs,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  headCopy: { flex: 1, gap: 2 },
  title: { ...typeScale.editorial, fontSize: 24, lineHeight: 29 },
  meta: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  close: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -space.sm,
    marginRight: -space.xs,
  },
  empty: { ...typeScale.caption, fontSize: 12, paddingVertical: space.xs },
  cta: {
    minHeight: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.xs,
  },
  ctaText: { ...typeScale.label, fontSize: 15, fontWeight: '700' },
});
