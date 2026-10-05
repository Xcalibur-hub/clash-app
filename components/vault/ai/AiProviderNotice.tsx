import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { aiProviderNotice } from '../../../utils/creatorAiState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';

export interface AiProviderNoticeProps {
  providerReady: boolean;
  externalError: boolean;
}

/**
 * Honest capability state. Two distinct truths are never merged into one vague
 * "something went wrong": a missing provider is a configuration fact, an
 * external error is a transient failure.
 */
export function AiProviderNotice({
  providerReady,
  externalError,
}: AiProviderNoticeProps): React.JSX.Element | null {
  const t = useThemeColors();
  const notice = aiProviderNotice({ providerReady, externalError });
  if (!notice) return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: notice.kind === 'unconfigured' ? t.textPrimary : t.border,
          backgroundColor: t.surfaceMuted,
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {notice.title}
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
        {notice.body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 3,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { ...typeScale.label, fontWeight: '800' },
  body: { ...typeScale.meta, lineHeight: 17 },
});
