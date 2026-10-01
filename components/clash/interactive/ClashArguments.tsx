/**
 * Editorial argument cards from real Take comments — no invented sides beyond text.
 * Horizontal browse with peek of the next card (Arena stack continuity).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ChallengerComment, User } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { Avatar } from '../../shared/Avatar';
import { GlowButton } from '../../shared/GlowButton';

export interface ClashArgumentItem {
  comment: ChallengerComment;
  author: User | undefined;
}

export interface ClashArgumentsProps {
  items: readonly ClashArgumentItem[];
  onMakeArgument?: () => void;
}

export function ClashArguments({ items, onMakeArgument }: ClashArgumentsProps): React.JSX.Element {
  const t = useThemeColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(280, width - 56);

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.heading, { color: t.textMuted }]}>
        Arguments
      </Text>

      {items.length === 0 ? (
        <View style={[styles.empty, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
            No arguments yet
          </Text>
          <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textMuted }]}>
            Be the first to make the case.
          </Text>
          {onMakeArgument ? (
            <GlowButton label="Make an argument" onPress={onMakeArgument} compact tone="glass" />
          ) : null}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          decelerationRate="fast"
          snapToInterval={cardWidth + space.sm}
          snapToAlignment="start"
        >
          {items.map((item, index) => (
            <View
              key={item.comment.id}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: t.border,
                  backgroundColor: t.surfaceElevated,
                  transform: [{ rotate: index % 2 === 0 ? '-0.8deg' : '1deg' }],
                  marginRight: index === items.length - 1 ? 0 : -8,
                  zIndex: items.length - index,
                },
              ]}
            >
              {item.author ? (
                <View style={styles.identity}>
                  <Avatar name={item.author.name} tint={item.author.tint} size={28} />
                  <Text
                    allowFontScaling={false}
                    style={[styles.handle, { color: t.textPrimary }]}
                    numberOfLines={1}
                  >
                    @{item.author.handle}
                  </Text>
                </View>
              ) : (
                <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]}>
                  Argument
                </Text>
              )}
              <Text allowFontScaling style={[styles.text, { color: t.textPrimary }]} numberOfLines={5}>
                {item.comment.text}
              </Text>
              <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
                {item.comment.upvotes} {item.comment.upvotes === 1 ? 'upvote' : 'upvotes'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.md },
  heading: {
    ...typeScale.caption,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  row: { gap: space.sm, paddingRight: space.md, paddingVertical: space.xs },
  card: {
    minHeight: 148,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  handle: { ...typeScale.caption, fontWeight: '600', flexShrink: 1 },
  text: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  meta: { ...typeScale.caption },
  empty: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  emptyTitle: { ...typeScale.title, fontWeight: '700' },
  emptyBody: { ...typeScale.body },
});
