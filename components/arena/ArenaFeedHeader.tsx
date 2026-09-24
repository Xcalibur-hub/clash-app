import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { ArenaHeader } from './ArenaHeader';
import { HOOD_LABEL } from '../../data/hoods';
import type { HoodId } from '../../store';
import { ink, layout, space, typeScale } from '../../theme';

export interface ArenaFeedHeaderProps {
  hood: HoodId;
  liveCount: number;
  onChangeHood: (hood: HoodId) => void;
}

const HOODS: HoodId[] = ['for-you', 'techtakes', 'campushustle', 'goatalk', 'movies', 'gaming'];

/**
 * Masthead → clean horizontal hood scroll → simple feed title.
 * Simplified header with crisp white text/underline for active hood.
 */
export function ArenaFeedHeader({
  hood,
  liveCount,
  onChangeHood,
}: ArenaFeedHeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <ArenaHeader />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hoodScroll}
      >
        {HOODS.map((hoodId) => (
          <TouchableOpacity
            key={hoodId}
            onPress={() => onChangeHood(hoodId)}
            style={styles.hoodTab}
            accessibilityRole="tab"
            accessibilityState={{ selected: hoodId === hood }}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.hoodText,
                hoodId === hood ? styles.hoodTextActive : styles.hoodTextInactive,
              ]}
            >
              {HOOD_LABEL[hoodId]}
            </Text>
            {hoodId === hood && <View style={styles.underline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.titleRow}>
        <Text allowFontScaling={false} style={styles.title}>
          Today's Takes
        </Text>
        <Text allowFontScaling={false} style={styles.liveCount}>
          {liveCount} live
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingBottom: layout.feedGap },
  hoodScroll: {
    paddingHorizontal: layout.screenX,
    gap: space.lg,
  },
  hoodTab: {
    position: 'relative',
    paddingBottom: space.xs,
  },
  hoodText: {
    ...typeScale.section,
    fontSize: 16,
  },
  hoodTextActive: {
    color: ink.primary,
    fontWeight: '700',
  },
  hoodTextInactive: {
    color: ink.subtitle,
    fontWeight: '400',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: ink.primary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
  },
  title: {
    ...typeScale.section,
    color: ink.primary,
  },
  liveCount: {
    ...typeScale.subtitle,
    color: ink.subtitle,
  },
});
