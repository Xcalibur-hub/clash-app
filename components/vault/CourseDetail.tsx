import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileById } from '../../services/profileService';
import {
  fetchCourseLessonCards,
  fetchCourseProgress,
  fetchCreatorCourse,
  vaultCoverUrl,
} from '../../services/vaultCommerceService';
import type { CourseLessonCard, CreatorCourse } from '../../services/vaultCommerceMappers';
import type { User } from '../../store';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

export function CourseDetail({ courseId }: { courseId: string }): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const [course, setCourse] = React.useState<CreatorCourse | null>(null);
  const [creator, setCreator] = React.useState<User | null>(null);
  const [lessons, setLessons] = React.useState<CourseLessonCard[]>([]);
  const [completed, setCompleted] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchCreatorCourse(courseId);
        if (!next) {
          if (!cancelled) setLoading(false);
          return;
        }
        const [profile, cards, progress] = await Promise.all([
          fetchProfileById(next.creatorId),
          fetchCourseLessonCards(courseId),
          fetchCourseProgress(courseId).catch(() => [] as string[]),
        ]);
        if (cancelled) return;
        setCourse(next);
        setCreator(profile);
        setLessons(cards);
        setCompleted(progress);
        analytics.trackOnce(`vault_course_viewed:${courseId}`, 'vault_course_viewed', {
          realm: 'vault',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState icon={VaultIcon} title="Course unavailable" body="This course could not be opened." />
      </View>
    );
  }

  const cover = vaultCoverUrl(course.coverMedia);
  const price = vaultOfferPriceLabel({
    accessType: course.accessType,
    priceAmountMinor: course.priceAmountMinor,
    currency: course.currency,
  });
  const firstOpen = lessons.find((l) => l.accessible) ?? lessons[0];
  const doneCount = completed.length;

  const renderItem = ({ item }: ListRenderItemInfo<CourseLessonCard>): React.JSX.Element => {
    const n = String(item.position).padStart(2, '0');
    const state = item.accessible
      ? completed.includes(item.id)
        ? 'Done'
        : 'Open'
      : item.previewAllowed
        ? 'Preview'
        : 'Locked';
    return (
      <Pressable
        onPress={() => router.push(`/vault/course/${courseId}/lesson/${item.id}`)}
        style={[styles.lesson, { borderColor: t.border, backgroundColor: t.surface }]}
        accessibilityRole="button"
        accessibilityLabel={`${n} ${item.title}`}
      >
        <Text allowFontScaling={false} style={[styles.lessonIndex, { color: t.textMuted }]}>
          {n}
        </Text>
        <View style={styles.lessonText}>
          <Text allowFontScaling={false} style={[styles.lessonTitle, { color: t.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text allowFontScaling={false} style={[styles.lessonMeta, { color: t.textMuted }]}>
            {state}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <FlatList
        data={lessons}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.head}>
            <BackChip onPress={() => router.back()} />
            <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
              {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <View style={styles.scrim} />
              <Text allowFontScaling={false} style={styles.kicker}>
                COURSE
              </Text>
              <Text allowFontScaling={false} style={styles.title}>
                {course.title}
              </Text>
            </View>
            {creator ? (
              <Text allowFontScaling={false} style={[styles.byline, { color: t.textMuted }]}>
                by {creator.name} · {price}
              </Text>
            ) : null}
            {course.description ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
                {course.description}
              </Text>
            ) : null}
            <Text allowFontScaling={false} style={[styles.progress, { color: t.textMuted }]}>
              {doneCount} / {lessons.length} lessons
            </Text>
            {firstOpen ? (
              <VaultActionButton
                label={doneCount > 0 ? 'Continue' : 'Start course'}
                onPress={() => {
                  analytics.track('vault_course_started', { realm: 'vault' });
                  router.push(`/vault/course/${courseId}/lesson/${firstOpen.id}`);
                }}
              />
            ) : null}
          </View>
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      />
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
  content: { paddingHorizontal: layout.screenX, gap: space.sm },
  head: { gap: space.md, marginBottom: space.md },
  back: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    aspectRatio: 16 / 10,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: 6,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,9,11,0.32)' },
  kicker: { ...typeScale.caption, color: 'rgba(250,250,248,0.8)', letterSpacing: 0.8, zIndex: 1 },
  title: { ...typeScale.display, color: '#FAFAF8', zIndex: 1 },
  byline: { ...typeScale.meta },
  body: { ...typeScale.body },
  progress: { ...typeScale.caption, letterSpacing: 0.4 },
  lesson: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    padding: space.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lessonIndex: { ...typeScale.meta, width: 28 },
  lessonText: { flex: 1, gap: 2 },
  lessonTitle: { ...typeScale.cardTitle },
  lessonMeta: { ...typeScale.caption },
});
