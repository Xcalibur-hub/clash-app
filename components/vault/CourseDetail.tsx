import React from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { fetchProfileById } from '../../services/profileService';
import { fetchCourseLessonCards, fetchCourseProgress, fetchCreatorCourse, vaultCoverUrl } from '../../services/vaultCommerceService';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { space, useThemeColors } from '../../theme';
import { ReadFeedback } from '../shared/ReadFeedback';
import { VaultBackButton } from './VaultBackButton';
import { VaultActionButton } from './VaultActionButton';
import { VaultAvailability } from './VaultAvailability';
import { styles } from './CourseDetail.styles';

export function CourseDetail({ courseId }: { courseId: string }): React.JSX.Element {
  const router = useRouter(), insets = useSafeAreaInsets(), t = useThemeColors(), { user } = useAuth();
  const scope = `${user?.id ?? 'guest'}:${courseId}`;
  const load = React.useCallback(async () => {
    const course = await fetchCreatorCourse(courseId);
    if (!course) return null;
    const [creator, lessons] = await Promise.all([fetchProfileById(course.creatorId), fetchCourseLessonCards(courseId)]);
    return { course, creator, lessons };
  }, [courseId]);
  const read = useRetryableRead(load, scope);
  const loadProgress = React.useCallback(() => fetchCourseProgress(courseId), [courseId]);
  const progress = useRetryableRead(loadProgress, user ? scope : null);
  React.useEffect(() => { if (read.status === 'ready') analytics.trackOnce(`vault_course_viewed:${courseId}`, 'vault_course_viewed', { realm: 'vault' }); }, [read.status, courseId]);
  if (read.status !== 'ready' || !read.data) return <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
    <VaultBackButton /><ReadFeedback status={read.status} subject="Course" retry={read.retry} />
  </View>;
  const { course, creator, lessons } = read.data;
  const completed = progress.data;
  const accessible = lessons.filter(item => item.accessible);
  const firstOpen = accessible.find(item => !completed?.includes(item.id)) ?? accessible[0] ?? lessons.find(item => item.previewAllowed);
  const previewOnly = firstOpen && !firstOpen.accessible;
  const doneCount = completed ? lessons.filter(item => completed.includes(item.id)).length : null;
  const cover = vaultCoverUrl(course.coverMedia);
  return <View style={[styles.screen, { backgroundColor: t.background }]}>
    <FlatList data={lessons} keyExtractor={item => item.id} showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const disabled = !item.accessible && !item.previewAllowed;
        const state = item.accessible ? completed?.includes(item.id) ? 'Done' : 'Open' : item.previewAllowed ? 'Preview' : 'Locked';
        return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
          accessibilityLabel={`${item.position} ${item.title}. ${state}`} style={[styles.lesson, { borderBottomColor: t.border }]}
          onPress={() => { if (!disabled) router.push(`/vault/course/${courseId}/lesson/${item.id}`); }}>
          <Text style={[styles.lessonIndex, { color: t.textMuted }]}>{item.position}</Text>
          <View style={styles.lessonText}><Text style={[styles.lessonTitle, { color: t.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.lessonMeta, { color: t.textMuted }]}>{state}</Text></View>
        </Pressable>;
      }}
      ListEmptyComponent={<Text style={{ color: t.textMuted }}>No lessons are available yet.</Text>}
      ListHeaderComponent={<View style={styles.head}>
        <VaultBackButton />
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {cover ? <Image source={{ uri: cover }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          <View style={styles.scrim} />
          <Text style={styles.kicker}>MASTERCLASS</Text><Text style={styles.title}>{course.title}</Text>
        </View>
        <Text style={[styles.byline, { color: t.textMuted }]}>{creator ? `by ${creator.name} ? ` : ''}{vaultOfferPriceLabel(course)}</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>{course.description}</Text>
        <VaultAvailability state={!lessons.length ? 'unavailable' : accessible.length ? course.accessType === 'subscriber' ? 'member' : course.accessType === 'free' ? 'free' : 'available' : previewOnly ? 'preview' : 'locked'} />
        {user ? progress.status === 'ready' ? <Text style={[styles.progress, { color: t.textMuted }]}>{doneCount} / {lessons.length} lessons complete</Text>
          : <ReadFeedback status={progress.status} subject="Course progress" retry={progress.retry} />
          : <Text style={{ color: t.textMuted }}>Sign in to track your progress.</Text>}
        {firstOpen ? <VaultActionButton label={previewOnly ? 'View preview' : doneCount ? 'Continue' : 'Start course'} onPress={() => {
          analytics.track('vault_course_started', { realm: 'vault' }); router.push(`/vault/course/${courseId}/lesson/${firstOpen.id}`);
        }} /> : null}
      </View>}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]} />
  </View>;
}
