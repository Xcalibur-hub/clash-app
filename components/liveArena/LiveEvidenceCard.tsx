import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaEvidence } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { evidenceHostLabel } from '../../utils/liveArenaUrl';
import { tap as hapticTap } from '../../utils/haptics';
import { PlayIcon } from '../shared/icons';
import { softFill } from './liveArenaStyles';

export interface LiveEvidenceCardProps {
  evidence: ArenaEvidence;
  /** Useful marks close with the room. */
  canMark?: boolean;
  /** Replying to the citation in the thread. */
  onChallenge?: (evidence: ArenaEvidence) => void;
  onMarkUseful?: (evidence: ArenaEvidence) => void;
  onReport?: (evidence: ArenaEvidence) => void;
  /** Horizontal rail cards get a fixed width; the detail list stretches. */
  width?: number;
  /** Nested under a message — quieter chrome. */
  inline?: boolean;
}

/**
 * A citation, rendered as a first-class card rather than a message.
 *
 * `usefulCount` is the room's own signal and the server recomputes it from the
 * mark table on every toggle — the card never increments a number itself, and
 * an author cannot mark their own evidence (the control is hidden for them).
 */
export function LiveEvidenceCard({
  evidence,
  canMark = true,
  onChallenge,
  onMarkUseful,
  onReport,
  width,
  inline = false,
}: LiveEvidenceCardProps): React.JSX.Element {
  const t = useThemeColors();
  const host = evidenceHostLabel(evidence.sourceUrl);
  const isImage = evidence.kind === 'image' && Boolean(evidence.mediaUrl);
  const isVideo = evidence.kind === 'video' && Boolean(evidence.mediaUrl);

  const openSource = (): void => {
    if (!evidence.sourceUrl) return;
    hapticTap();
    void Linking.openURL(evidence.sourceUrl).catch(() => undefined);
  };

  return (
    <View
      style={[
        styles.card,
        inline && styles.inlineCard,
        width ? { width } : styles.stretch,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
      accessibilityLabel={`Evidence. ${evidence.title}`}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          EVIDENCE
        </Text>
        {evidence.author ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.by, { color: t.textMuted }]}
          >
            @{evidence.author.handle}
          </Text>
        ) : null}
      </View>

      <Text
        allowFontScaling={false}
        numberOfLines={3}
        style={[styles.title, { color: t.textPrimary }]}
      >
        {evidence.title}
      </Text>

      {host ? (
        <Pressable
          onPress={openSource}
          accessibilityRole="link"
          accessibilityLabel={`Open source on ${host}`}
          hitSlop={4}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.host, { color: t.accent }]}>
            {host}
          </Text>
        </Pressable>
      ) : null}

      {isImage || isVideo ? (
        <View style={[styles.preview, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
          <Image
            source={{ uri: evidence.mediaUrl as string }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {isVideo ? (
            <View style={styles.play} pointerEvents="none">
              <PlayIcon size={18} color="#FAFAF8" strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        {canMark && onMarkUseful && !evidence.isOwn ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onMarkUseful(evidence);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: evidence.viewerMarkedUseful }}
            accessibilityLabel={
              evidence.viewerMarkedUseful ? 'Remove useful mark' : 'Mark this evidence useful'
            }
            style={[
              styles.chip,
              {
                backgroundColor: evidence.viewerMarkedUseful ? softFill(t) : 'transparent',
                borderColor: evidence.viewerMarkedUseful ? t.borderStrong : t.border,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.chipText, { color: t.textSecondary }]}>
              Useful · {evidence.usefulCount}
            </Text>
          </Pressable>
        ) : (
          <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
            {evidence.usefulCount} found this useful
          </Text>
        )}

        {onChallenge ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onChallenge(evidence);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Challenge this evidence"
          >
            <Text allowFontScaling={false} style={[styles.link, { color: t.textMuted }]}>
              Challenge
            </Text>
          </Pressable>
        ) : null}

        {onReport ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onReport(evidence);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Report this evidence"
          >
            <Text allowFontScaling={false} style={[styles.link, { color: t.textMuted }]}>
              Report
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inlineCard: {
    marginTop: space.xs,
    padding: space.sm,
  },
  stretch: { alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  eyebrow: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  by: { ...typeScale.caption, fontSize: 10, flexShrink: 1 },
  title: { ...typeScale.label, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  host: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  preview: {
    height: 92,
    borderRadius: radius.xs,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  play: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.28)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  count: { ...typeScale.caption, fontSize: 11 },
  link: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
