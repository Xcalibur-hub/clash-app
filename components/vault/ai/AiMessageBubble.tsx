import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CreatorAiMessage } from '../../../services/creatorAiMappers';
import { aiMessageProvenance, clampReply } from '../../../utils/creatorAiState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface AiMessageBubbleProps {
  message: CreatorAiMessage;
  /** Only assistant replies can be reported. */
  onReport?: (messageId: string) => void;
}

/**
 * The viewer's own words and an AI reply are visually distinct by construction:
 * the reply carries a persistent provenance line, the viewer's message never
 * does.
 */
export function AiMessageBubble({ message, onReport }: AiMessageBubbleProps): React.JSX.Element {
  const t = useThemeColors();
  const isAi = message.role === 'assistant';
  const provenance = aiMessageProvenance(message);

  const body = (
    <View
      style={[
        styles.bubble,
        {
          borderColor: t.border,
          backgroundColor: isAi ? t.surfaceElevated : t.surfaceMuted,
          alignSelf: isAi ? 'flex-start' : 'flex-end',
        },
      ]}
    >
      {provenance ? (
        <Text allowFontScaling={false} style={[styles.provenance, { color: t.textMuted }]}>
          {provenance}
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={[styles.body, { color: t.textPrimary }]}>
        {clampReply(message.body)}
      </Text>
    </View>
  );

  if (!isAi || !onReport || message.id.startsWith('local_')) return body;

  return (
    <Pressable
      onLongPress={() => {
        hapticTap();
        onReport(message.id);
      }}
      accessibilityRole="button"
      accessibilityLabel="AI reply. Long press to report it."
      delayLongPress={400}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    gap: 3,
    maxWidth: '88%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  provenance: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  body: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
});
