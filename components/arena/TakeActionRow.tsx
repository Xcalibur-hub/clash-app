import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaIcon, ArrowBigUpIcon, BookmarkIcon, CommentIcon, ShareIcon } from '../shared/icons';

export interface TakeActionRowProps {
  reactions: number;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
  onReact: () => void;
  onComment: () => void;
  onClash: () => void;
  onShare: () => void;
  onSave: () => void;
}

interface MetaActionProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

function MetaAction({
  icon: Icon,
  label,
  active = false,
  accessibilityLabel,
  onPress,
}: MetaActionProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active ? { selected: true } : undefined}
      style={styles.metaAction}
    >
      <Icon size={19} color={active ? ink.primary : ink.tertiary} strokeWidth={active ? 2.4 : 2.1} />
      {label ? (
        <Text allowFontScaling={false} style={styles.metaLabel}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Compact social action row: upvote, rebuttals, CLASH … share, save. */
export function TakeActionRow(props: TakeActionRowProps): React.JSX.Element {
  const { reactions, commentCount, isSaved, hasReacted, onReact, onComment, onClash, onShare, onSave } =
    props;
  return (
    <View style={styles.row}>
      <MetaAction
        icon={ArrowBigUpIcon}
        label={compact(reactions)}
        active={hasReacted}
        accessibilityLabel="React to this take"
        onPress={onReact}
      />
      <MetaAction
        icon={CommentIcon}
        label={commentCount > 0 ? compact(commentCount) : 'Replies'}
        accessibilityLabel="Open rebuttals"
        onPress={onComment}
      />
      <Pressable
        onPress={() => {
          hapticTap();
          onClash();
        }}
        accessibilityRole="button"
        accessibilityLabel="Clash on this take"
        style={styles.clash}
      >
        <ArenaIcon size={15} color={ink.primary} strokeWidth={2.4} />
        <Text allowFontScaling={false} style={styles.clashText}>
          CLASH
        </Text>
      </Pressable>
      <View style={styles.spacer} />
      <MetaAction icon={ShareIcon} label="" accessibilityLabel="Share this take" onPress={onShare} />
      <MetaAction
        icon={BookmarkIcon}
        label=""
        active={isSaved}
        accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this take'}
        onPress={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  metaAction: {
    minHeight: 40,
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  metaLabel: { ...typeScale.meta, fontSize: 13, color: ink.tertiary },
  clash: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  clashText: { ...typeScale.label, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: ink.primary },
  spacer: { flex: 1 },
});
