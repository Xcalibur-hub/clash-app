import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { action, card, ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { IconButton } from '../shared/IconButton';
import { BookmarkIcon, FlameIcon, ShareIcon } from '../shared/icons';
import { timeLeftLabel } from '../../utils/format';

export interface TakeActionsProps {
  take: Take;
  challengerHandle?: string;
  isSaved: boolean;
  hasReacted: boolean;
  onClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
  now: number;
}

/**
 * Redesigned actions: subtle meta line, full-width solid white CTA, subtle bottom actions.
 */
export function TakeActions({
  take,
  challengerHandle,
  isSaved,
  hasReacted,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
  now,
}: TakeActionsProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.meta}>
        {`🔥 ${compact(take.clashes)} Clashes   ${timeLeftLabel(take.expiresAt, now)} left`}
      </Text>

      <Pressable
        onPress={onClash}
        style={styles.cta}
        accessibilityRole="button"
        accessibilityLabel="Clash on this take"
      >
        <Text allowFontScaling={false} style={styles.ctaText}>
          CLASH
        </Text>
      </Pressable>

      <View style={styles.secondaryRow}>
        <IconButton
          icon={FlameIcon}
          onPress={onReact}
          label="React to this take"
          size={40}
          active={hasReacted}
          tone="a"
        />
        <IconButton
          icon={BookmarkIcon}
          onPress={onSave}
          label={isSaved ? 'Remove from saved' : 'Save this take'}
          size={40}
          active={isSaved}
          tone="gold"
        />
        <IconButton icon={ShareIcon} onPress={onShare} label="Share this take" size={40} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  meta: { ...typeScale.subtitle, color: ink.subtitle },
  cta: {
    backgroundColor: action.fill,
    borderRadius: radius.pill,
    paddingVertical: space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typeScale.button, color: action.text },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
