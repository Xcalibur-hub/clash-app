import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { fetchCourseLessonCard, requestLessonMediaAccess } from '../../services/vaultCommerceService';
import { getPublicMediaUrl } from '../../services/mediaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { ReadFeedback } from '../shared/ReadFeedback';
import { VaultBackButton } from './VaultBackButton';
import { VaultActionButton } from './VaultActionButton';
import { VaultAvailability } from './VaultAvailability';
import { VaultReaderMedia } from './VaultReaderMedia';
import { LessonCompletion } from './LessonCompletion';

export function LessonReader({ courseId, lessonId }: { courseId: string; lessonId: string }): React.JSX.Element {
  const router = useRouter(), insets = useSafeAreaInsets(), t = useThemeColors(), { user } = useAuth();
  const scope = `${user?.id ?? 'guest'}:${courseId}:${lessonId}`;
  const load = React.useCallback(async () => {
    const lesson = await fetchCourseLessonCard(lessonId);
    return lesson?.courseId === courseId ? lesson : null;
  }, [courseId, lessonId]);
  const read = useRetryableRead(load, scope);
  const loadMedia = React.useCallback(async () => {
    const lesson = read.data;
    if (!lesson) return null;
    if (lesson.publicMedia && (lesson.accessible || lesson.previewAllowed)) return { url: getPublicMediaUrl(lesson.publicMedia.bucket, lesson.publicMedia.path), kind: lesson.publicMedia.kind };
    if (lesson.accessible && lesson.hasPrivateMedia) { const access = await requestLessonMediaAccess(lesson.id); return { url: access.url, kind: access.mediaKind }; }
    return null;
  }, [read.data]);
  return <View style={[styles.screen, { backgroundColor: t.background }]}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <VaultBackButton fallback={`/vault/course/${courseId}`} />
      {read.status !== 'ready' || !read.data ? <ReadFeedback status={read.status} subject="Lesson" retry={read.retry} /> : <>
        <Text style={[styles.kicker, { color: t.textMuted }]}>LESSON {read.data.position}</Text>
        <Text style={[styles.title, { color: t.textPrimary }]}>{read.data.title}</Text>
        <VaultAvailability state={read.data.accessible ? read.data.accessType === 'subscriber' ? 'member' : read.data.accessType === 'free' ? 'free' : 'available' : read.data.previewAllowed ? 'preview' : 'locked'} />
        <VaultReaderMedia key={scope} load={loadMedia} scope={scope} />
        {read.data.accessible ? <>
          <Text style={[styles.body, { color: t.textSecondary }]}>{read.data.bodyText}</Text>
          <LessonCompletion key={scope} lessonId={read.data.id} />
        </> : <VaultActionButton label="Back to course" tone="quiet" onPress={() => router.replace(`/vault/course/${courseId}`)} />}
      </>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: layout.screenX, gap: space.md },
  kicker: { ...typeScale.caption }, title: { ...typeScale.title }, body: { ...typeScale.body },
});
