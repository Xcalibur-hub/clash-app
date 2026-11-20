/**
 * Targeted reply-typing cue — polite, non-noisy, no draft text.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { ArenaTypingState } from '../../services/liveArenaService';
import {
  formatGenericTypingLabel,
  formatReplyTypingLabel,
  typersReplyingToViewer,
} from '../../utils/roomTyping';
import { space, typeScale, useThemeColors } from '../../theme';

export interface LiveRoomTypingCueProps {
  peers: readonly ArenaTypingState[];
  viewerId: string;
  viewerMessageIds: ReadonlySet<string>;
  /** When true, also show a subtle “People are typing…” at the live edge. */
  showGeneric?: boolean;
}

export function LiveRoomTypingCue({
  peers,
  viewerId,
  viewerMessageIds,
  showGeneric = false,
}: LiveRoomTypingCueProps): React.JSX.Element | null {
  const t = useThemeColors();
  const targeted = typersReplyingToViewer(peers, viewerMessageIds, viewerId);
  const targetedLabel = formatReplyTypingLabel(targeted);
  const genericLabel =
    !targetedLabel && showGeneric
      ? formatGenericTypingLabel(peers, viewerId)
      : null;
  const label = targetedLabel ?? genericLabel;

  React.useEffect(() => {
    if (!targetedLabel) return;
    AccessibilityInfo.announceForAccessibility(targetedLabel);
  }, [targetedLabel]);

  if (!label) return null;

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text allowFontScaling={false} style={[styles.text, { color: t.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    alignItems: 'center',
  },
  text: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    fontStyle: 'italic',
  },
});
