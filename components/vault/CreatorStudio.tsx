import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { showNotice, useClash } from '../../store';
import { fetchViewerProfile } from '../../services/apiService';
import {
  createVault,
  deleteDrop,
  fetchMyVault,
  fetchStorefront,
  publishDrop,
  updateVault,
} from '../../services/vaultService';
import {
  createCreatorCourse,
  createCreatorProduct,
  createCreatorService,
  createCourseLesson,
  fetchCreatorCourses,
  fetchCreatorProducts,
  fetchCreatorServices,
  fetchMyServiceRequests,
  setCourseLessonStatus,
  setCreatorCourseStatus,
  setCreatorProductStatus,
  setCreatorServiceStatus,
  setServiceRequestStatus,
} from '../../services/vaultCommerceService';
import type { CreatorVault, StorefrontDrop } from '../../services/vaultMappers';
import type {
  CreatorCourse,
  CreatorProduct,
  CreatorService,
  VaultServiceRequest,
} from '../../services/vaultCommerceMappers';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { duration, layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { CreatorDropRow } from './CreatorDropRow';
import { VaultActionButton } from './VaultActionButton';
import { VaultFormSheet } from './VaultFormSheet';

type StudioTab = 'drops' | 'services' | 'courses' | 'shop';
type Phase = 'loading' | 'ready';

const TABS: readonly { key: StudioTab; label: string }[] = [
  { key: 'drops', label: 'Drops' },
  { key: 'services', label: 'Services' },
  { key: 'courses', label: 'Courses' },
  { key: 'shop', label: 'Shop' },
];

/** Creator-only management surface for Vault offerings. */
export function CreatorStudio(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [tab, setTab] = React.useState<StudioTab>('drops');
  const [vault, setVault] = React.useState<CreatorVault | null>(null);
  const [drops, setDrops] = React.useState<StorefrontDrop[]>([]);
  const [services, setServices] = React.useState<CreatorService[]>([]);
  const [courses, setCourses] = React.useState<CreatorCourse[]>([]);
  const [products, setProducts] = React.useState<CreatorProduct[]>([]);
  const [requests, setRequests] = React.useState<VaultServiceRequest[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<'create' | 'edit'>('create');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createKind, setCreateKind] = React.useState<'service' | 'course' | 'product' | 'lesson'>('service');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [lessonCourseId, setLessonCourseId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [mine, me] = await Promise.all([fetchMyVault(), fetchViewerProfile()]);
      setVault(mine);
      if (!mine || !me) {
        setDrops([]);
        setServices([]);
        setCourses([]);
        setProducts([]);
        setRequests([]);
        return;
      }
      const [storefront, nextServices, nextCourses, nextProducts, nextRequests] = await Promise.all([
        fetchStorefront(mine.id),
        fetchCreatorServices(me.id, { includeDrafts: true }),
        fetchCreatorCourses(me.id, { includeDrafts: true }),
        fetchCreatorProducts(me.id, { includeDrafts: true }),
        fetchMyServiceRequests(),
      ]);
      setDrops(storefront);
      setServices(nextServices);
      setCourses(nextCourses);
      setProducts(nextProducts);
      setRequests(nextRequests.filter((r) => r.creatorId === me.id));
      analytics.trackOnce('vault_opened:self', 'vault_opened', {
        realm: 'vault',
        is_creator: true,
        is_guest: false,
      });
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPhase('ready');
    }
  }, [dispatch]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  const submitVault = async (nextTitle: string, nextDescription: string): Promise<void> => {
    setBusy(true);
    try {
      if (formMode === 'create') {
        await createVault(nextTitle, nextDescription);
        dispatch(showNotice('Vault opened.'));
      } else if (vault) {
        await updateVault(vault.id, nextTitle, nextDescription);
        dispatch(showNotice('Vault updated.'));
      }
      setFormOpen(false);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async (): Promise<void> => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      if (createKind === 'service') {
        const row = await createCreatorService({ title: title.trim(), description: description.trim() });
        await setCreatorServiceStatus(row.id, 'published');
        dispatch(showNotice('Service published.'));
      } else if (createKind === 'course') {
        const row = await createCreatorCourse({ title: title.trim(), description: description.trim() });
        await setCreatorCourseStatus(row.id, 'published');
        dispatch(showNotice('Course published.'));
      } else if (createKind === 'product') {
        const row = await createCreatorProduct({
          title: title.trim(),
          description: description.trim(),
          accessType: 'paid',
          priceAmountMinor: 49900,
          currency: 'INR',
        });
        await setCreatorProductStatus(row.id, 'published');
        dispatch(showNotice('Product published.'));
      } else if (createKind === 'lesson' && lessonCourseId) {
        const lesson = await createCourseLesson({
          courseId: lessonCourseId,
          title: title.trim(),
          description: description.trim(),
          bodyText: description.trim(),
          accessType: 'free',
        });
        await setCourseLessonStatus(lesson.id, 'published');
        dispatch(showNotice('Lesson published.'));
      }
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!vault) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <EmptyState
          icon={VaultIcon}
          title="Open your Vault"
          body="Create your world before adding services, courses, or products."
          actionLabel="Create Vault"
          onAction={() => {
            setFormMode('create');
            setFormOpen(true);
          }}
        />
        <VaultFormSheet
          visible={formOpen}
          mode={formMode}
          initialTitle=""
          initialDescription=""
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSubmit={(a, b) => void submitVault(a, b)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: dockBottomPadding(insets.bottom),
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
          Studio
        </Text>
        <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
          Manage Drops, services, courses, and shop.
        </Text>

        <View style={styles.actions}>
          <VaultActionButton label="New Drop" compact onPress={() => router.push('/vault/compose')} />
          <VaultActionButton
            label="Manage Vault"
            tone="quiet"
            compact
            onPress={() => {
              setFormMode('edit');
              setFormOpen(true);
            }}
          />
        </View>

        <SegmentedTabs value={tab} items={TABS} onChange={setTab} label="Studio sections" />

        {tab === 'drops' ? (
          drops.length === 0 ? (
            <EmptyState
              icon={VaultIcon}
              title="No Drops yet"
              body="Share something your followers won't find in Arena."
              actionLabel="Create Drop"
              onAction={() => router.push('/vault/compose')}
            />
          ) : (
            <View style={styles.list}>
              {drops.map((drop) => (
                <CreatorDropRow
                  key={drop.id}
                  drop={drop}
                  onOpen={() => router.push(`/vault/drop/${drop.id}`)}
                  onPublish={
                    drop.status === 'draft'
                      ? () =>
                          void publishDrop(drop.id)
                            .then(() => load())
                            .catch((error) => dispatch(showNotice(errorText(error))))
                      : undefined
                  }
                  onRemove={() =>
                    void deleteDrop(drop.id)
                      .then(() => load())
                      .catch((error) => dispatch(showNotice(errorText(error))))
                  }
                />
              ))}
            </View>
          )
        ) : null}

        {tab === 'services' ? (
          <View style={styles.list}>
            <VaultActionButton
              label="Create service"
              compact
              onPress={() => {
                setCreateKind('service');
                setCreateOpen(true);
              }}
            />
            {services.map((service) => (
              <StudioRow
                key={service.id}
                title={service.title}
                meta={`${service.status} · ${service.accessType}`}
                onOpen={() => router.push(`/vault/service/${service.id}`)}
                onToggle={() =>
                  void setCreatorServiceStatus(
                    service.id,
                    service.status === 'published' ? 'draft' : 'published',
                  )
                    .then(() => load())
                    .catch((error) => dispatch(showNotice(errorText(error))))
                }
                toggleLabel={service.status === 'published' ? 'Unpublish' : 'Publish'}
              />
            ))}
            {requests.length > 0 ? (
              <>
                <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
                  REQUESTS
                </Text>
                {requests.map((req) => (
                  <View
                    key={req.id}
                    style={[styles.request, { borderColor: t.border, backgroundColor: t.surface }]}
                  >
                    <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]} numberOfLines={2}>
                      {req.message}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
                      {req.status}
                    </Text>
                    {req.status === 'requested' ? (
                      <View style={styles.actions}>
                        <VaultActionButton
                          label="Accept"
                          compact
                          onPress={() =>
                            void setServiceRequestStatus(req.id, 'accepted')
                              .then(() => load())
                              .catch((error) => dispatch(showNotice(errorText(error))))
                          }
                        />
                        <VaultActionButton
                          label="Decline"
                          tone="quiet"
                          compact
                          onPress={() =>
                            void setServiceRequestStatus(req.id, 'declined')
                              .then(() => load())
                              .catch((error) => dispatch(showNotice(errorText(error))))
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {tab === 'courses' ? (
          <View style={styles.list}>
            <VaultActionButton
              label="Create course"
              compact
              onPress={() => {
                setCreateKind('course');
                setCreateOpen(true);
              }}
            />
            {courses.map((course) => (
              <View key={course.id} style={styles.list}>
                <StudioRow
                  title={course.title}
                  meta={`${course.status} · ${course.lessonCount} lessons`}
                  onOpen={() => router.push(`/vault/course/${course.id}`)}
                  onToggle={() =>
                    void setCreatorCourseStatus(
                      course.id,
                      course.status === 'published' ? 'draft' : 'published',
                    )
                      .then(() => load())
                      .catch((error) => dispatch(showNotice(errorText(error))))
                  }
                  toggleLabel={course.status === 'published' ? 'Unpublish' : 'Publish'}
                />
                <VaultActionButton
                  label="Add lesson"
                  tone="quiet"
                  compact
                  onPress={() => {
                    setCreateKind('lesson');
                    setLessonCourseId(course.id);
                    setCreateOpen(true);
                  }}
                />
              </View>
            ))}
          </View>
        ) : null}

        {tab === 'shop' ? (
          <View style={styles.list}>
            <VaultActionButton
              label="Create product"
              compact
              onPress={() => {
                setCreateKind('product');
                setCreateOpen(true);
              }}
            />
            {products.map((product) => (
              <StudioRow
                key={product.id}
                title={product.title}
                meta={`${product.status} · ${product.productType}`}
                onOpen={() => router.push(`/vault/product/${product.id}`)}
                onToggle={() =>
                  void setCreatorProductStatus(
                    product.id,
                    product.status === 'published' ? 'draft' : 'published',
                  )
                    .then(() => load())
                    .catch((error) => dispatch(showNotice(errorText(error))))
                }
                toggleLabel={product.status === 'published' ? 'Unpublish' : 'Publish'}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <VaultFormSheet
        visible={formOpen}
        mode={formMode}
        initialTitle={vault.title}
        initialDescription={vault.description}
        busy={busy}
        onClose={() => setFormOpen(false)}
        onSubmit={(a, b) => void submitVault(a, b)}
      />

      <Modal visible={createOpen} transparent animationType="none" onRequestClose={() => setCreateOpen(false)}>
        <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.scrim, { backgroundColor: t.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.sheet}>
            <View style={[styles.sheetCard, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
              <Text allowFontScaling={false} style={[styles.sheetTitle, { color: t.textPrimary }]}>
                Create {createKind}
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                placeholder="Title"
                placeholderTextColor={t.textMuted}
                style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground }]}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={500}
                multiline
                placeholder="Description"
                placeholderTextColor={t.textMuted}
                style={[
                  styles.input,
                  styles.textarea,
                  { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
                ]}
              />
              <VaultActionButton label={busy ? 'Saving…' : 'Save'} onPress={() => void submitCreate()} />
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

function StudioRow({
  title,
  meta,
  onOpen,
  onToggle,
  toggleLabel,
}: {
  title: string;
  meta: string;
  onOpen: () => void;
  onToggle: () => void;
  toggleLabel: string;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
      <Pressable onPress={onOpen} style={styles.rowMain}>
        <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
          {meta}
        </Text>
      </Pressable>
      <VaultActionButton label={toggleLabel} tone="quiet" compact onPress={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  brand: { ...typeScale.display },
  tagline: { ...typeScale.body, marginTop: -4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  list: { gap: space.md },
  section: { ...typeScale.caption, letterSpacing: 0.8, marginTop: space.sm },
  row: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.sm,
  },
  rowMain: { gap: 4 },
  rowTitle: { ...typeScale.cardTitle },
  rowMeta: { ...typeScale.meta },
  request: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.sm,
  },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: space.md, paddingBottom: space.md },
  sheetCard: {
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { ...typeScale.section },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
});
