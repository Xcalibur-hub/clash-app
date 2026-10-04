import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  completeCourseLesson,
  fetchCourseLessonCard,
  requestLessonMediaAccess,
  vaultCoverUrl,
} from '../../services/vaultCommerceService';
import type { CourseLessonCard } from '../../services/vaultCommerceMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { showNotice, useClash } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, PlayIcon, VaultIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

export function LessonReader({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { dispatch } = useClash();
  const [lesson, setLesson] = React.useState<CourseLessonCard | null>(null);
  const [mediaUrl, setMediaUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const card = await fetchCourseLessonCard(lessonId);
        if (!card || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }
        setLesson(card);
        if (card.publicMedia) {
          setMediaUrl(getPublicMediaUrl(card.publicMedia.bucket, card.publicMedia.path));
        } else if (card.accessible && card.hasPrivateMedia) {
          try {
            const access = await requestLessonMediaAccess(lessonId);
            if (!cancelled) setMediaUrl(access.url);
          } catch {
            // locked or unavailable — leave media empty
          }
        } else if (card.previewAllowed) {
          setMediaUrl(vaultCoverUrl(card.publicMedia));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState icon={VaultIcon} title="Lesson unavailable" body="This lesson could not be opened." />
      </View>
    );
  }

  const markDone = async (): Promise<void> => {
    try {
      await completeCourseLesson(lesson.id);
      analytics.track('vault_lesson_completed', { realm: 'vault' });
      dispatch(showNotice('Marked complete.'));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BackChip onPress={() => router.back()} />
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          LESSON {String(lesson.position).padStart(2, '0')}
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {lesson.title}
        </Text>

        {!lesson.accessible ? (
          <View style={[styles.locked, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
            {mediaUrl ? (
              <Image source={{ uri: mediaUrl }} style={styles.preview} resizeMode="cover" />
            ) : null}
            <Text allowFontScaling={false} style={[styles.lockedTitle, { color: t.textPrimary }]}>
              {lesson.previewAllowed ? 'Preview' : 'Locked'}
            </Text>
            <Text allowFontScaling={false} style={[styles.lockedBody, { color: t.textSecondary }]}>
              Full lesson content stays protected until you have access.
            </Text>
            <VaultActionButton
              label="Back to course"
              tone="quiet"
              onPress={() => router.replace(`/vault/course/${courseId}`)}
            />
          </View>
        ) : (
          <>
            {mediaUrl ? (
              lesson.contentType === 'video' ? (
                <View style={[styles.video, { backgroundColor: t.surfaceMuted }]}>
                  <PlayIcon size={28} color={t.textPrimary} strokeWidth={2.2} />
                  <Text allowFontScaling={false} style={[styles.videoNote, { color: t.textMuted }]}>
                    Video playback arrives with the media player.
                  </Text>
                </View>
              ) : (
                <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="cover" />
              )
            ) : null}
            {lesson.bodyText ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
                {lesson.bodyText}
              </Text>
            ) : null}
            <VaultActionButton label="Mark complete" onPress={() => void markDone()} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BackChip({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[styles.back, { backgroundColor: t.surface, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  back: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  kicker: { ...typeScale.caption, letterSpacing: 0.8 },
  title: { ...typeScale.title },
  body: { ...typeScale.body },
  media: { width: '100%', aspectRatio: 4 / 5, borderRadius: 24 },
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 18, marginBottom: space.sm },
  video: {
    aspectRatio: 16 / 9,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
  },
  videoNote: { ...typeScale.meta, textAlign: 'center' },
  locked: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  lockedTitle: { ...typeScale.section, textAlign: 'center' },
  lockedBody: { ...typeScale.body, textAlign: 'center' },
});
