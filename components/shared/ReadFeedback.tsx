import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadStatus } from '../../hooks/useRetryableRead';
import { space, typeScale, useThemeColors } from '../../theme';

/** Missing/hidden records deliberately share copy; explicit permission refusals stay distinct. */
export function ReadFeedback({ status, subject, retry }: {
  status: ReadStatus; subject: string; retry: () => void;
}): React.JSX.Element | null {
  const t = useThemeColors();
  if (status === 'ready') return null;
  if (status === 'loading') return (
    <View style={styles.wrap} accessibilityLabel={`Loading ${subject}`}>
      <ActivityIndicator color={t.textPrimary} /><Text style={{ color: t.textMuted }}>Loading {subject}…</Text>
    </View>
  );
  const message = status === 'denied' ? `${subject} access was refused. Check your account and permissions.`
    : status === 'missing' ? `${subject} is unavailable. It may have been removed or not shared with you.`
      : status === 'unavailable' ? `${subject} isn't available in this configuration.`
        : `Couldn't load ${subject}. This is not an empty result.`;
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={[styles.body, { color: t.textSecondary }]}>{message}</Text>
      {status === 'error' ? (
        <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel={`Retry ${subject}`}
          style={[styles.retry, { borderColor: t.border }]}>
          <Text style={[styles.label, { color: t.textPrimary }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { paddingVertical: space.md, gap: space.sm },
  body: { ...typeScale.body }, label: { ...typeScale.label },
  retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
});
