import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { CreatorLiveSession } from '../../../services/creatorLiveMappers';
import { liveStatusLabel, watchingLabel } from '../../../utils/creatorLiveState';
import { isNativePlayable, resolveLiveVideoSource } from '../../../utils/creatorLiveVideo';
import { personalityRadius, type WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { space, typeScale, useThemeColors } from '../../../theme';
import { LiveVideoSurface } from './LiveVideoSurface';

export interface LiveStageProps {
  session: CreatorLiveSession;
  personality: WorldPersonality;
  watching: number;
  posterUrl: string | null;
  /** When true the stage fills its parent instead of holding an aspect ratio. */
  fill?: boolean;
  children?: React.ReactNode;
}

/**
 * The live plane: a real stream when one exists, otherwise an honest standby
 * poster. Everything above it (badge, identity, count) is creator-safe data.
 */
export function LiveStage({
  session,
  personality,
  watching,
  posterUrl,
  fill = false,
  children,
}: LiveStageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const source = resolveLiveVideoSource({
    provider: session.provider,
    streamUrl: session.streamUrl,
    posterUrl,
    status: session.status,
  });
  const isLive = session.status === 'LIVE';
  const radius = personalityRadius(personality);

  return (
    <View
      style={[
        styles.stage,
        fill ? styles.fill : styles.chapter,
        { borderRadius: radius, borderColor: t.border, backgroundColor: '#0B0B0D' },
      ]}
    >
      {isNativePlayable(source) && source.url ? (
        <LiveVideoSurface
          url={source.url}
          accessibilityLabel={`${session.creatorName ?? 'Creator'} live`}
        />
      ) : source.posterUrl ? (
        <Image source={{ uri: source.posterUrl }} style={styles.surface} resizeMode="cover" />
      ) : (
        <View
          style={[
            styles.surface,
            {
              backgroundColor: session.creatorTint ?? '#16161A',
            },
          ]}
        />
      )}

      <View style={styles.topRow}>
        <View
          style={[
            styles.badge,
            { backgroundColor: isLive ? '#E5484D' : 'rgba(0,0,0,0.62)' },
          ]}
        >
          {isLive ? (
            <Animated.View
              entering={reduced ? undefined : FadeIn.duration(200)}
              style={styles.dot}
            />
          ) : null}
          <Text allowFontScaling={false} style={styles.badgeLabel}>
            {liveStatusLabel(session.status)}
          </Text>
        </View>
        {session.access === 'SUBSCRIBER' ? (
          <View style={[styles.accessChip, { borderColor: 'rgba(255,255,255,0.35)' }]}>
            <Text allowFontScaling={false} style={styles.badgeLabel}>
              MEMBERS
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <Text allowFontScaling={false} style={styles.creator} numberOfLines={1}>
          {session.creatorName ?? 'Creator'}
        </Text>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          {[isLive ? watchingLabel(watching) : source.note, session.creatorHandle ? `@${session.creatorHandle}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, justifyContent: 'flex-end' },
  chapter: { width: '100%', aspectRatio: 4 / 5 },
  fill: { flex: 1 },
  surface: { ...StyleSheet.absoluteFillObject },
  topRow: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', gap: space.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  badgeLabel: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#FFFFFF' },
  accessChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottom: { padding: space.md, gap: 2, backgroundColor: 'rgba(0,0,0,0.42)' },
  creator: { ...typeScale.section, fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  meta: { ...typeScale.caption, color: 'rgba(255,255,255,0.78)' },
});
