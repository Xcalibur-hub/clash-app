import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { WorldDrop } from '../../services/worldService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { MapPinIcon, PlayIcon } from '../shared/icons';

export interface WorldDropCardProps {
  drop: WorldDrop;
  now?: number;
}

/**
 * World Drop card — content around an approximate area.
 * Never implies the author is live at that place.
 */
export function WorldDropCard({ drop, now = Date.now() }: WorldDropCardProps): React.JSX.Element {
  const place =
    drop.locationLabel ??
    drop.distanceBand ??
    'Around here';
  const author = drop.author ? `@${drop.author.handle}` : 'someone';
  const expiry = drop.expiresAt ? timeLeftLabel(drop.expiresAt, now) : null;

  return (
    <View style={styles.card} accessibilityLabel={`World Drop by ${author}`}>
      <View style={styles.media}>
        {drop.media?.kind === 'image' && drop.media.url ? (
          <Image source={{ uri: drop.media.url }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.mediaFallback]}>
            {drop.media?.kind === 'video' ? (
              <PlayIcon size={28} color={ink.primary} strokeWidth={2.2} />
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={styles.author}>{author}</Text>
        {drop.caption ? (
          <Text allowFontScaling={false} style={styles.caption} numberOfLines={3}>
            {drop.caption}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <MapPinIcon size={14} color={ink.tertiary} strokeWidth={2} />
          <Text allowFontScaling={false} style={styles.meta}>{place}</Text>
          {expiry ? (
            <Text allowFontScaling={false} style={styles.meta}>· {expiry}</Text>
          ) : null}
        </View>
        {drop.mission ? (
          <Text allowFontScaling={false} style={styles.mission}>
            Mission · {drop.mission.title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { gap: 6, padding: space.md },
  author: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  caption: { ...typeScale.body, color: ink.secondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { ...typeScale.meta, color: ink.tertiary },
  mission: { ...typeScale.caption, color: ink.tertiary },
});
