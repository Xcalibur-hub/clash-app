/**
 * Editorial argument stack — vertical cards, no horizontal clipping.
 * Side attribution only when author matches a revealed Clash participant.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment, Side, User } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { Avatar } from '../../shared/Avatar';
import { GlowButton } from '../../shared/GlowButton';
import { useDuelSurface } from './clashTheme';

export interface ClashArgumentItem {
  comment: ChallengerComment;
  author: User | undefined;
  /** Present only when we can map the author to a revealed side. */
  side?: Side | null;
}

export interface ClashArgumentsProps {
  items: readonly ClashArgumentItem[];
  onMakeArgument?: () => void;
}

export function ClashArguments({ items, onMakeArgument }: ClashArgumentsProps): React.JSX.Element {
  const t = useThemeColors();
  const sideA = useDuelSurface('A');
  const sideB = useDuelSurface('B');

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
        <View style={styles.stack}>
          {items.map((item, index) => {
            const tone =
              item.side === 'A' ? sideA.tone : item.side === 'B' ? sideB.tone : null;
            return (
              <View
                key={item.comment.id}
                style={[
                  styles.card,
                  {
                    borderColor: tone ?? t.border,
                    backgroundColor: t.surfaceElevated,
                    borderLeftColor: tone ?? t.borderStrong,
                    marginTop: index === 0 ? 0 : -2,
                    zIndex: 20 - index,
                    transform: [{ rotate: index % 2 === 0 ? '-0.35deg' : '0.45deg' }],
                  },
                ]}
              >
                <View style={styles.top}>
                  {item.author ? (
                    <View style={styles.identity}>
                      <Avatar name={item.author.name} tint={item.author.tint} size={26} />
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
                  {item.side && tone ? (
                    <Text allowFontScaling={false} style={[styles.sideTag, { color: tone }]}>
                      Side {item.side}
                    </Text>
                  ) : null}
                </View>
                <Text allowFontScaling style={[styles.text, { color: t.textPrimary }]}>
                  {item.comment.text}
                </Text>
                <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
                  {item.comment.upvotes} {item.comment.upvotes === 1 ? 'upvote' : 'upvotes'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.lg },
  heading: {
    ...typeScale.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 11,
  },
  stack: { gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 2.5,
    gap: space.sm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  handle: { ...typeScale.caption, fontWeight: '600', flexShrink: 1 },
  sideTag: { ...typeScale.caption, fontWeight: '700', fontSize: 11, letterSpacing: 0.4 },
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
