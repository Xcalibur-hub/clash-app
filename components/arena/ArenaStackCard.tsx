import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import {
  ArenaIcon,
  ArrowBigUpIcon,
  BookmarkIcon,
  CommentIcon,
} from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { ArenaStackMedia } from './ArenaStackMedia';

export interface ArenaStackCardProps {
  take: Take;
  author: User;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
  active: boolean;
  screenFocused: boolean;
  onOpen: () => void;
  onReact: () => void;
  onComment: () => void;
  onClash: () => void;
  onSave: () => void;
}

/** Premium editorial discovery card — full-bleed media + compact overlay meta. */
function ArenaStackCardBase({
  take,
  author,
  commentCount,
  isSaved,
  hasReacted,
  active,
  screenFocused,
  onOpen,
  onReact,
  onComment,
  onClash,
  onSave,
}: ArenaStackCardProps): React.JSX.Element {
  const t = useThemeColors();
  const media = take.media;
  const headline = take.text.trim();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.shadowOpacity,
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Featured take by ${author.name} in ${HOOD_LABEL[take.hood]}. ${headline}`}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open take"
        style={styles.mediaHit}
      >
        {media ? (
          <ArenaStackMedia media={media} active={active} screenFocused={screenFocused} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surfaceMuted }]} />
        )}
        <LinearGradient
          colors={[...t.mediaScrim]}
          locations={[0.38, 0.62, 1]}
          style={styles.veil}
          pointerEvents="none"
        />
        <Pressable
          onPress={() => {
            hapticTap();
            onSave();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: isSaved }}
          accessibilityLabel={isSaved ? 'Remove from saved' : 'Save take'}
          hitSlop={8}
          style={styles.saveBtn}
        >
          <BookmarkIcon size={18} color="#FFFFFF" strokeWidth={isSaved ? 2.6 : 2.1} />
        </Pressable>
        <View style={styles.meta} pointerEvents="box-none">
          <Text allowFontScaling={false} style={styles.hood} numberOfLines={1}>
            {HOOD_LABEL[take.hood]}
          </Text>
          <Text allowFontScaling style={styles.headline} numberOfLines={3}>
            {headline}
          </Text>
          <View style={styles.authorRow}>
            <Avatar name={author.name} tint={author.tint} size={24} />
            <Text allowFontScaling={false} style={styles.author} numberOfLines={1}>
              {author.name}
            </Text>
            <Text allowFontScaling={false} style={styles.time}>
              · {timeAgo(take.createdAt)}
            </Text>
          </View>
          <View style={styles.stats}>
            <Text allowFontScaling={false} style={styles.stat}>
              ↑ {compact(take.reactions)}
            </Text>
            <Text allowFontScaling={false} style={styles.stat}>
              💬 {compact(commentCount)}
            </Text>
            {take.clashes > 0 ? (
              <Text allowFontScaling={false} style={styles.stat}>
                ⚔ {compact(take.clashes)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={[styles.actions, { backgroundColor: t.surface, borderTopColor: t.border }]}>
        <Pressable
          onPress={() => {
            hapticTap();
            onReact();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: hasReacted }}
          accessibilityLabel="React"
          style={styles.action}
        >
          <ArrowBigUpIcon
            size={18}
            color={hasReacted ? t.textPrimary : t.textSecondary}
            strokeWidth={hasReacted ? 2.5 : 2.1}
          />
          <Text allowFontScaling={false} style={[styles.actionLabel, { color: t.textSecondary }]}>
            {compact(take.reactions)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            hapticTap();
            onComment();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
          style={styles.action}
        >
          <CommentIcon size={17} color={t.textSecondary} strokeWidth={2.1} />
          <Text allowFontScaling={false} style={[styles.actionLabel, { color: t.textSecondary }]}>
            {commentCount > 0 ? compact(commentCount) : 'Reply'}
          </Text>
        </Pressable>
        <PressableScale
          onPress={() => {
            hapticTap();
            onClash();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clash on this take"
          style={[styles.clash, { backgroundColor: t.clashFill }]}
        >
          <ArenaIcon size={13} color={t.clashText} strokeWidth={2.6} />
          <Text allowFontScaling={false} style={[styles.clashText, { color: t.clashText }]}>
            CLASH
          </Text>
        </PressableScale>
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

export const ArenaStackCard = React.memo(ArenaStackCardBase);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  mediaHit: { flex: 1 },
  veil: { ...StyleSheet.absoluteFillObject },
  saveBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  meta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: 6,
  },
  hood: {
    ...typeScale.caption,
    fontSize: 11,
    letterSpacing: 0.9,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    opacity: 0.92,
  },
  headline: {
    ...typeScale.takeText,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#FFFFFF',
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  author: { ...typeScale.label, fontSize: 13, color: '#FFFFFF', fontWeight: '700', flexShrink: 1 },
  time: { ...typeScale.meta, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  stats: { flexDirection: 'row', gap: space.md, marginTop: 4 },
  stat: { ...typeScale.meta, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  actionLabel: { ...typeScale.meta, fontSize: 13 },
  clash: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  clashText: {
    ...typeScale.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spacer: { flex: 1 },
});
