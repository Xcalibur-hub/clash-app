import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowButton } from '../../../components/shared/GlowButton';
import { useClock } from '../../../hooks/useClock';
import { useMediaPicker } from '../../../hooks/useMediaPicker';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { analytics } from '../../../services/analytics';
import {
  completeUpload,
  createUpload,
  failUpload,
  readPickedBytes,
  uploadFile,
} from '../../../services/mediaService';
import {
  fetchChallengeDetail,
  joinChallenge,
  listChallengeEntries,
  submitChallengeEntry,
  toggleChallengeEntryReaction,
  type ChallengeDetail,
  type ChallengeEntry,
} from '../../../services/playService';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { timeLeftLabel } from '../../../utils/format';
import { press as hapticPress, tap as hapticTap } from '../../../utils/haptics';

type SortMode = 'trending' | 'new';

export default function ChallengeDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = typeof id === 'string' ? id : '';
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useClock(15_000);
  const requireAuth = useRequireAuth();
  const { pickImage, pickVideo } = useMediaPicker();

  const [detail, setDetail] = React.useState<ChallengeDetail | null>(null);
  const [entries, setEntries] = React.useState<ChallengeEntry[]>([]);
  const [cursor, setCursor] = React.useState<number | null>(0);
  const [sort, setSort] = React.useState<SortMode>('trending');
  const [loading, setLoading] = React.useState(true);
  const [joining, setJoining] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [caption, setCaption] = React.useState('');
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(async () => {
    if (!challengeId) return;
    const d = await fetchChallengeDetail(challengeId);
    setDetail(d);
  }, [challengeId]);

  const loadEntries = React.useCallback(
    async (reset: boolean) => {
      if (!challengeId) return;
      const page = await listChallengeEntries(challengeId, sort, 24, reset ? 0 : (cursor ?? 0));
      setEntries((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    },
    [challengeId, cursor, sort],
  );

  React.useEffect(() => {
    analytics.track('challenge_opened', { realm: 'explore', source: 'explore' });
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadDetail();
        const page = await listChallengeEntries(challengeId, sort, 24, 0);
        if (!alive) return;
        setEntries(page.items);
        setCursor(page.nextCursor);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load challenge');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [challengeId, sort]);

  const onJoin = async () => {
    if (!requireAuth()) return;
    setJoining(true);
    try {
      await joinChallenge(challengeId);
      analytics.track('challenge_joined', { realm: 'explore', source: 'explore' });
      hapticPress();
      await loadDetail();
      setComposeOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Join failed');
    } finally {
      setJoining(false);
    }
  };

  const uploadAndSubmit = async (kind: 'image' | 'video') => {
    if (!requireAuth()) return;
    const picked = kind === 'image' ? await pickImage() : await pickVideo();
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    const mime = picked.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
    let planId: string | null = null;
    try {
      const plan = await createUpload(picked.kind, mime, 'public');
      planId = plan.id;
      const bytes = await readPickedBytes(picked.uri);
      await uploadFile(plan, bytes, mime);
      await completeUpload(plan.id, bytes.byteLength, {
        width: picked.width,
        height: picked.height,
        ...(picked.durationMs ? { durationMs: picked.durationMs } : {}),
      });
      await submitChallengeEntry(challengeId, plan.id, caption.trim() || null);
      analytics.track('challenge_submitted', {
        realm: 'explore',
        source: 'explore',
        media_type: kind,
      });
      hapticPress();
      setComposeOpen(false);
      setCaption('');
      await loadDetail();
      const page = await listChallengeEntries(challengeId, sort, 24, 0);
      setEntries(page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      if (planId) {
        try {
          await failUpload(planId);
        } catch {
          /* ignore */
        }
      }
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onReact = async (entry: ChallengeEntry) => {
    if (!requireAuth()) return;
    const prev = entry.reacted;
    setEntries((list) =>
      list.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              reacted: !prev,
              reactionsCount: Math.max(0, e.reactionsCount + (prev ? -1 : 1)),
            }
          : e,
      ),
    );
    try {
      const result = await toggleChallengeEntryReaction(entry.id);
      analytics.track('challenge_entry_reacted', { realm: 'explore', source: 'explore' });
      setEntries((list) =>
        list.map((e) =>
          e.id === entry.id
            ? { ...e, reacted: result.reacted, reactionsCount: result.reactionsCount }
            : e,
        ),
      );
    } catch {
      setEntries((list) =>
        list.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                reacted: prev,
                reactionsCount: Math.max(0, e.reactionsCount + (prev ? 1 : -1)),
              }
            : e,
        ),
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <Text allowFontScaling={false} style={{ color: t.textMuted }}>
          {error ?? 'Challenge not found'}
        </Text>
        <GlowButton label="Back" onPress={() => router.back()} tone="glass" compact />
      </View>
    );
  }

  const ended = detail.status === 'ended' || detail.endsAt <= now;
  const complete = Boolean(detail.result);

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {detail.coverUrl ? (
                <Image source={{ uri: detail.coverUrl }} style={StyleSheet.absoluteFill} />
              ) : (
                <LinearGradient colors={['#24362E', '#0C0C10']} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.scrim} />
              <Pressable
                onPress={() => router.back()}
                style={[styles.back, { top: insets.top + 8 }]}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Text allowFontScaling={false} style={styles.backLabel}>
                  ←
                </Text>
              </Pressable>
              <View style={[styles.heroCopy, { paddingTop: insets.top + 56 }]}>
                <Text allowFontScaling={false} style={styles.scope}>
                  {detail.challengeType}
                  {detail.countryCode ? ` · ${detail.countryCode}` : ''}
                </Text>
                <Text allowFontScaling={false} style={styles.title}>
                  {detail.title}
                </Text>
                {detail.host ? (
                  <Pressable onPress={() => router.push(`/profile/${detail.host!.id}` as never)}>
                    <Text allowFontScaling={false} style={styles.host}>
                      @{detail.host.handle}
                    </Text>
                  </Pressable>
                ) : null}
                <Text allowFontScaling={false} style={styles.meta}>
                  {ended ? 'Ended' : timeLeftLabel(detail.endsAt, now)} · {detail.entryCount}{' '}
                  entries
                </Text>
              </View>
            </View>

            <View style={styles.body}>
              {detail.description ? (
                <Text allowFontScaling={false} style={[styles.desc, { color: t.textSecondary }]}>
                  {detail.description}
                </Text>
              ) : null}

              {complete ? (
                <View style={[styles.resultCard, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
                  <Text allowFontScaling={false} style={[styles.resultKicker, { color: t.textMuted }]}>
                    CHALLENGE COMPLETE
                  </Text>
                  <Text allowFontScaling={false} style={[styles.resultTitle, { color: t.textPrimary }]}>
                    Winner
                  </Text>
                  {detail.result?.winnerProfileId ? (
                    <Pressable
                      onPress={() =>
                        router.push(`/profile/${detail.result!.winnerProfileId}` as never)
                      }
                    >
                      <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
                        View winner profile
                      </Text>
                    </Pressable>
                  ) : (
                    <Text allowFontScaling={false} style={{ color: t.textMuted }}>
                      No eligible entries
                    </Text>
                  )}
                  {detail.myEntryId ? (
                    <Text allowFontScaling={false} style={{ color: t.textMuted, marginTop: space.sm }}>
                      Your entry is in the final board.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {!ended && !detail.myEntryId ? (
                <GlowButton
                  label={detail.joined ? 'Submit entry' : joining ? 'Joining…' : 'Join challenge'}
                  onPress={() => {
                    if (detail.joined) setComposeOpen(true);
                    else void onJoin();
                  }}
                  tone="light"
                />
              ) : null}

              {composeOpen && !ended && !detail.myEntryId ? (
                <View style={[styles.compose, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Optional caption"
                    placeholderTextColor={t.textMuted}
                    maxLength={280}
                    style={[styles.caption, { color: t.textPrimary, borderColor: t.border }]}
                  />
                  <View style={styles.composeRow}>
                    <GlowButton
                      label={submitting ? 'Uploading…' : 'Photo'}
                      onPress={() => void uploadAndSubmit('image')}
                      tone="glass"
                      compact
                      disabled={submitting}
                    />
                    <GlowButton
                      label={submitting ? '…' : 'Video'}
                      onPress={() => void uploadAndSubmit('video')}
                      tone="glass"
                      compact
                      disabled={submitting}
                    />
                  </View>
                </View>
              ) : null}

              {error ? (
                <Text allowFontScaling={false} style={{ color: '#C45C5C' }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.sortRow}>
                {(
                  [
                    ['trending', 'Trending'],
                    ['new', 'New'],
                  ] as const
                ).map(([id, label]) => {
                  const on = sort === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => {
                        hapticTap();
                        setSort(id);
                      }}
                      style={[
                        styles.sortChip,
                        {
                          backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                          borderColor: t.border,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={{ color: on ? t.background : t.textPrimary, fontWeight: '700' }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.entry, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
            onPress={() => router.push(`/profile/${item.author.id}` as never)}
          >
            {item.mediaUrl ? (
              <Image source={{ uri: item.mediaUrl }} style={styles.entryMedia} />
            ) : (
              <View style={[styles.entryMedia, { backgroundColor: '#1C2220' }]} />
            )}
            <View style={styles.entryCopy}>
              <Text allowFontScaling={false} style={[styles.entryAuthor, { color: t.textPrimary }]}>
                @{item.author.handle}
              </Text>
              {item.caption ? (
                <Text allowFontScaling={false} style={{ color: t.textMuted }} numberOfLines={2}>
                  {item.caption}
                </Text>
              ) : null}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  void onReact(item);
                }}
                hitSlop={8}
              >
                <Text allowFontScaling={false} style={{ color: item.reacted ? '#E8C97A' : t.textMuted }}>
                  ♥ {item.reactionsCount}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        )}
        onEndReached={() => {
          if (cursor != null) void loadEntries(false);
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <Text
            allowFontScaling={false}
            style={{ color: t.textMuted, paddingHorizontal: layout.screenX, marginTop: space.md }}
          >
            No entries yet — be the first.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  hero: { height: 360, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject },
  back: {
    position: 'absolute',
    left: layout.screenX,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  backLabel: { color: '#fff', fontSize: 22, fontWeight: '600' },
  heroCopy: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.lg,
    gap: 6,
  },
  scope: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: typeScale.caption.fontFamily,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontFamily: typeScale.display.fontFamily,
    fontSize: 30,
    fontWeight: '800',
  },
  host: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  meta: { color: 'rgba(255,255,255,0.65)' },
  body: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    gap: space.md,
  },
  desc: { fontFamily: typeScale.body.fontFamily, fontSize: 15, lineHeight: 22 },
  resultCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 6,
  },
  resultKicker: {
    fontFamily: typeScale.caption.fontFamily,
    letterSpacing: 1.6,
    fontWeight: '700',
    fontSize: 11,
  },
  resultTitle: { fontSize: 22, fontWeight: '800' },
  compose: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  caption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  composeRow: { flexDirection: 'row', gap: space.sm },
  sortRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gridRow: {
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    marginBottom: space.sm,
  },
  entry: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  entryMedia: { width: '100%', height: 150 },
  entryCopy: { padding: space.sm, gap: 4 },
  entryAuthor: { fontWeight: '700', fontSize: 13 },
});
