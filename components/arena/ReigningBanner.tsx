import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment, User } from '../../store/types';
import { accent, ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { CrownIcon } from '../shared/icons';

export interface ReigningBannerProps {
  comment: ChallengerComment | undefined;
  author: User | undefined;
}

/** Gold callout for the #1 most-upvoted rebuttal, shown right under the Take. */
export function ReigningBanner({ comment, author }: ReigningBannerProps): React.JSX.Element | null {
  if (!comment) return null;
  return (
    <View style={styles.banner} accessibilityLabel="Reigning Take B rebuttal">
      <View style={styles.head}>
        <CrownIcon size={13} color={accent.gold} strokeWidth={2.4} />
        <Text allowFontScaling={false} style={styles.eyebrow}>REIGNING TAKE B</Text>
        {author ? (
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{author.handle}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={styles.votes}>
          {'\u25B2 '}{compact(comment.upvotes)}
        </Text>
      </View>
      <Text allowFontScaling={false} style={styles.text} numberOfLines={2}>
        {comment.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(255,200,97,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,200,97,0.35)',
    borderRadius: 14,
    padding: space.md,
    gap: space.xs + 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  eyebrow: { ...typeScale.caption, fontSize: 10, color: accent.gold },
  handle: { ...typeScale.caption, fontSize: 11, color: ink.tertiary, flexShrink: 1 },
  votes: { ...typeScale.data, fontSize: 11, color: accent.gold, marginLeft: 'auto' },
  text: { fontSize: 14, lineHeight: 19, color: ink.primary, fontWeight: '500' },
});
