import {withExploreAccount} from '../../../components/explore/ExploreAccountBoundary';
import {useOperationScope} from '../../../hooks/useOperationScope';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClueProgressDots } from '../../../components/play/ClueProgressDots';
import { GiftReveal } from '../../../components/play/GiftReveal';
import { GlowButton } from '../../../components/shared/GlowButton';
import { useClock } from '../../../hooks/useClock';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { analytics } from '../../../services/analytics';
import {
  claimTreasureReward,
  completeContentClue,
  fetchTreasureDetail,
  joinTreasureHunt,
  submitTreasureAnswer,
  type TreasureDetail,
} from '../../../services/playService';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { timeLeftLabel } from '../../../utils/format';
import { notify as hapticNotify, press as hapticPress, tap as hapticTap } from '../../../utils/haptics';

function TreasureDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const huntId = typeof id === 'string' ? id : '';
  const isCurrent = useOperationScope(huntId);
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useClock(15_000);
  const requireAuth = useRequireAuth();

  const operationBusy=React.useRef(false);
  const [detail, setDetail] = React.useState<TreasureDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showGift, setShowGift] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);

  const reload = React.useCallback(async () => {
    const d = await fetchTreasureDetail(huntId);
    if(!isCurrent())return;
    setDetail(d);
    if (d.completed && !d.claimed) setShowGift(true);
  }, [huntId,isCurrent]);

  React.useEffect(() => {
    analytics.track('treasure_opened', { realm: 'explore', source: 'explore' });
    let alive = true;
    (async () => {
      setLoading(true);
      setDetail(null);setAnswer('');setFeedback(null);setShowGift(false);setError(null);
      try {
        const d = await fetchTreasureDetail(huntId);
        if (!alive) return;
        setDetail(d);
        if (d.completed && !d.claimed) setShowGift(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Hunt not found');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [huntId]);

  const onJoin = async () => {
    if (!requireAuth() || operationBusy.current || !isCurrent()) return;
    operationBusy.current=true;
    setBusy(true);
    setError(null);
    try {
      await joinTreasureHunt(huntId);
      if(!isCurrent())return;
      analytics.track('treasure_joined', { realm: 'explore', source: 'explore' });
      hapticPress();
      await reload();
    } catch (e) {
      if(!isCurrent())return;
      setError(e instanceof Error ? e.message : 'Join failed');
    } finally {
      if(isCurrent()){operationBusy.current=false;setBusy(false);}
    }
  };

  const onSubmitAnswer = async (value?: string) => {
    if (!requireAuth() || !detail?.currentClue || operationBusy.current || !isCurrent()) return;
    const text = (value ?? answer).trim();
    if (!text) return;
    operationBusy.current=true;
    setBusy(true);
    setFeedback(null);
    try {
      analytics.track('treasure_clue_attempted', { realm: 'explore', source: 'explore' });
      const result = await submitTreasureAnswer(huntId, detail.currentClue.id, text);
      if(!isCurrent())return;
      if (!result.correct) {
        setFeedback('Not quite — try another angle.');
        hapticNotify('warning');
      } else {
        analytics.track('treasure_clue_completed', { realm: 'explore', source: 'explore' });
        setAnswer('');
        setFeedback(result.completed ? 'Hunt complete.' : 'Clue unlocked.');
        hapticNotify('success');
        if (result.completed) {
          analytics.track('treasure_completed', { realm: 'explore', source: 'explore' });
          setShowGift(true);
        }
        await reload();
      }
    } catch (e) {
      if(!isCurrent())return;
      setError(e instanceof Error ? e.message : 'Answer failed');
    } finally {
      if(isCurrent()){operationBusy.current=false;setBusy(false);}
    }
  };

  const onContentFind = async () => {
    if (!requireAuth() || !detail?.currentClue || operationBusy.current || !isCurrent()) return;
    // CONTENT_FIND: user navigates Clash; here they confirm a guessed public target id.
    // For V1 UX we accept a pasted public content id — never private answers.
    const contentId = answer.trim();
    if (!contentId) {
      setFeedback('Find the public post, then paste its id.');
      return;
    }
    operationBusy.current=true;
    setBusy(true);
    try {
      analytics.track('treasure_clue_attempted', { realm: 'explore', source: 'explore' });
      const result = await completeContentClue(huntId, detail.currentClue.id, contentId);
      if(!isCurrent())return;
      if (!result.correct) {
        setFeedback('That content is not the hidden mark.');
        hapticNotify('warning');
      } else {
        analytics.track('treasure_clue_completed', { realm: 'explore', source: 'explore' });
        setAnswer('');
        if (result.completed) {
          analytics.track('treasure_completed', { realm: 'explore', source: 'explore' });
          setShowGift(true);
        }
        await reload();
      }
    } catch (e) {
      if(!isCurrent())return;
      setError(e instanceof Error ? e.message : 'Could not verify');
    } finally {
      if(isCurrent()){operationBusy.current=false;setBusy(false);}
    }
  };

  const onClaim = async () => {
    if (!requireAuth() || operationBusy.current || !isCurrent()) return;
    operationBusy.current=true;
    setClaiming(true);
    try {
      await claimTreasureReward(huntId);
      if(!isCurrent())return;
      analytics.track('treasure_reward_claimed', { realm: 'explore', source: 'explore' });
      hapticNotify('success');
      await reload();
    } catch (e) {
      if(!isCurrent())return;
      setError(e instanceof Error ? e.message : 'Claim failed');
    } finally {
      if(isCurrent()){operationBusy.current=false;setClaiming(false);}
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
          {error ?? 'Treasure not found'}
        </Text>
        <GlowButton label="Back" onPress={() => router.back()} tone="glass" compact />
      </View>
    );
  }

  const giftsLabel =
    detail.giftsRemaining == null
      ? 'Unlimited gifts'
      : `${detail.giftsRemaining} gifts remaining`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
    >
      <View style={styles.hero}>
        {detail.coverUrl ? (
          <Image source={{ uri: detail.coverUrl }} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={['#2A2438', '#0C0C10']} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFill} />
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
            {detail.huntType}
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
            {timeLeftLabel(detail.endsAt, now)} · {giftsLabel}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.teaser, { color: t.textSecondary }]}>
          {detail.teaser}
        </Text>

        <ClueProgressDots solved={detail.progress} total={detail.clueCount} />

        {!detail.joined ? (
          <GlowButton
            label={busy ? 'Joining…' : 'Begin hunt'}
            onPress={() => void onJoin()}
            tone="light"
            disabled={busy}
          />
        ) : null}

        {detail.joined && detail.currentClue && !detail.completed ? (
          <View style={[styles.clueCard, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
            <Text allowFontScaling={false} style={[styles.clueKicker, { color: t.textMuted }]}>
              CLUE {detail.currentClue.sortOrder}
            </Text>
            <Text allowFontScaling={false} style={[styles.cluePrompt, { color: t.textPrimary }]}>
              {detail.currentClue.prompt}
            </Text>

            {detail.currentClue.clueType === 'MULTIPLE_CHOICE' ? (
              <View style={styles.choices}>
                {detail.currentClue.choices.map((choice) => (
                  <Pressable
                    key={choice}
                    onPress={() => {
                      hapticTap();
                      void onSubmitAnswer(choice);
                    }}
                    style={[styles.choice, { borderColor: t.border }]}
                  >
                    <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '600' }}>
                      {choice}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <>
                <TextInput
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder={
                    detail.currentClue.clueType === 'CONTENT_FIND'
                      ? 'Public content id'
                      : 'Your answer'
                  }
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  style={[styles.input, { color: t.textPrimary, borderColor: t.border }]}
                />
                <GlowButton
                  label={busy ? 'Checking…' : 'Submit'}
                  onPress={() =>
                    void (detail.currentClue?.clueType === 'CONTENT_FIND'
                      ? onContentFind()
                      : onSubmitAnswer())
                  }
                  tone="light"
                  disabled={busy}
                />
              </>
            )}

            {detail.currentClue.clueType === 'CONTENT_FIND' ? (
              <View style={styles.discoverLinks}>
                <GlowButton
                  label="Browse Arena"
                  onPress={() => router.push('/(tabs)' as never)}
                  tone="glass"
                  compact
                />
                <GlowButton
                  label="Open Vault"
                  onPress={() => router.push('/vault/compose' as never)}
                  tone="glass"
                  compact
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {showGift || (detail.completed && !detail.claimed) ? (
          <GiftReveal
            label={detail.rewardLabel}
            rewardType={detail.rewardType}
            onClaim={() => void onClaim()}
            claiming={claiming}
            claimed={detail.claimed}
          />
        ) : null}

        {detail.claimed ? (
          <Text allowFontScaling={false} style={{ color: t.success, fontWeight: '700' }}>
            Reward claimed — wear it well.
          </Text>
        ) : null}

        {feedback ? (
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            {feedback}
          </Text>
        ) : null}
        {error ? (
          <Text allowFontScaling={false} style={{ color: t.danger }}>
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  hero: { height: 360, justifyContent: 'flex-end' },
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
  teaser: {
    fontFamily: typeScale.body.fontFamily,
    fontSize: 16,
    lineHeight: 24,
  },
  clueCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  clueKicker: {
    fontFamily: typeScale.caption.fontFamily,
    letterSpacing: 1.8,
    fontWeight: '700',
    fontSize: 11,
  },
  cluePrompt: {
    fontFamily: typeScale.takeText.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: 12,
  },
  choices: { gap: space.sm },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  discoverLinks: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});

export default withExploreAccount(TreasureDetailScreen);
