import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';

export interface CreatorDropRowProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  onPublish?: () => void;
  onRemove?: () => void;
}

/**
 * Creator management row — status and actions secondary to the Drop itself.
 */
export function CreatorDropRow({ drop, onOpen, onPublish, onRemove }: CreatorDropRowProps): React.JSX.Element {
  const t = useThemeColors();
  const isSubscriber = drop.accessLevel === 'subscriber';
  const mediaUrl =
    !isSubscriber && drop.publicMedia?.kind === 'image'
      ? getPublicMediaUrl(drop.publicMedia.bucket, drop.publicMedia.path)
      : null;
  const statusLabel = drop.status.charAt(0).toUpperCase() + drop.status.slice(1);
  const expiry =
    drop.status === 'published' && drop.expiresAt ? timeLeftLabel(drop.expiresAt) : null;

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.06 : 0,
        },
      ]}
      accessibilityLabel={`${drop.status} drop: ${drop.caption}`}
    >
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, { backgroundColor: t.surfaceMuted }]} />
      )}

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]} numberOfLines={2}>
          {drop.caption}
        </Text>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {[statusLabel, isSubscriber ? 'Subscriber' : 'Free', expiry].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.actions}>
          {drop.status === 'draft' && onPublish ? (
            <Pressable
              onPress={() => {
                hapticTap();
                onPublish();
              }}
              accessibilityRole="button"
              accessibilityLabel="Publish drop"
              style={[styles.action, { backgroundColor: t.textPrimary }]}
            >
              <Text allowFontScaling={false} style={[styles.actionPrimary, { color: t.textInverse }]}>
                Publish
              </Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable
              onPress={() => {
                hapticTap();
                onRemove();
              }}
              accessibilityRole="button"
              accessibilityLabel="Remove drop"
              style={[styles.action, { borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}
            >
              <Text allowFontScaling={false} style={[styles.actionSecondary, { color: t.danger }]}>
                Remove
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.sm,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  thumb: {
    width: 72,
    height: 90,
    borderRadius: 12,
  },
  body: { flex: 1, gap: 6, paddingVertical: 4, paddingRight: 4 },
  caption: { ...typeScale.label, fontWeight: '600' },
  meta: { ...typeScale.meta },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 2 },
  action: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  actionPrimary: { ...typeScale.meta, fontWeight: '600' },
  actionSecondary: { ...typeScale.meta, fontWeight: '600' },
});
