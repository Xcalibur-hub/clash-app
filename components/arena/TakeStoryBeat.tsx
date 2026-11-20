import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment, User } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { resolveStillUrl } from '../../utils/mediaStill';
import { pulseLabel, type TakePulse } from '../../utils/takePulse';

export interface TakeStoryBeatProps {
  comment: ChallengerComment;
  author: User | undefined;
  clashCount?: number;
  pulse?: TakePulse;
  onOpen: () => void;
  onMedia?: boolean;
}

/**
 * Real activity teaser for Arena feed cards — top reply / meme / proof.
 * Never invents engagement; omit when there is nothing to show.
 */
export function TakeStoryBeat({
  comment,
  author,
  clashCount = 0,
  pulse = null,
  onOpen,
  onMedia = false,
}: TakeStoryBeatProps): React.JSX.Element {
  const t = useThemeColors();
  const still = resolveStillUrl(comment.media ?? null);
  const isGif = comment.media?.kind === 'gif';
  const handle = author?.handle ?? 'challenger';
  const ink = onMedia ? 'rgba(250,250,248,0.92)' : t.textPrimary;
  const muted = onMedia ? 'rgba(250,250,248,0.62)' : t.textMuted;
  const rail = onMedia ? 'rgba(255,255,255,0.28)' : t.borderStrong;
  const kicker = isGif
    ? '💀 CROWD MOMENT'
    : pulse === 'clash'
      ? '⚔ CLASH ACTIVE'
      : pulse === 'hot' || pulse === 'rising'
        ? `🔥 ${pulseLabel(pulse)}`
        : 'HOT RIGHT NOW';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${kicker} by @${handle}`}
      style={[styles.wrap, { borderLeftColor: rail }]}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: muted }]}>
          {kicker}
        </Text>
        {clashCount > 0 ? (
          <Text allowFontScaling={false} style={[styles.clash, { color: muted }]}>
            {`⚔ ${compact(clashCount)}`}
          </Text>
        ) : null}
      </View>
      <Text allowFontScaling={false} style={[styles.meta, { color: muted }]} numberOfLines={1}>
        @{handle}
        {comment.upvotes > 0 ? ` · ${compact(comment.upvotes)}` : ''}
      </Text>
      {still ? (
        <Image
          source={{ uri: still }}
          style={[styles.media, isGif && styles.mediaGif]}
          resizeMode="cover"
        />
      ) : null}
      {comment.text ? (
        <Text allowFontScaling={false} style={[styles.quote, { color: ink }]} numberOfLines={2}>
          {comment.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 3,
    marginTop: space.sm,
    paddingLeft: space.sm,
    borderLeftWidth: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  clash: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  meta: { ...typeScale.meta, fontSize: 11 },
  quote: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  media: {
    marginTop: 6,
    width: '100%',
    height: 96,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  mediaGif: { height: 128 },
});
