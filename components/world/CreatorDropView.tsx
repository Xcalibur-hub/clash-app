import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CreatorWorldDrop, CreatorDropClaim } from '../../services/creatorWorldDropMappers';
import { claimWorldDrop, creatorDropMediaUrl } from '../../services/creatorWorldDropService';
import { currentViewerProfileId } from '../../services/apiService';
import { errorText } from '../../services/supabaseClient';
import {
  dropActionLabel,
  dropDiscoveryHint,
  dropDiscoveryLine,
  dropIsEndingSoon,
  rewardTypeLabel,
} from '../../utils/creatorWorldDrops';
import { showNotice, useClash } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { timeAgo, timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { GlowButton } from '../shared/GlowButton';
import { VaultActionButton } from '../vault/VaultActionButton';
import { CreatorDropFound } from './CreatorDropFound';

export interface CreatorDropViewProps {
  drop: CreatorWorldDrop;
  onClose: () => void;
}

/** Discovery experience for a Creator World Drop — playful, not a form. */
export function CreatorDropView({ drop, onClose }: CreatorDropViewProps): React.JSX.Element {
  const router = useRouter();
  const t = useThemeColors();
  const { dispatch } = useClash();
  const [me, setMe] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [claim, setClaim] = React.useState<CreatorDropClaim | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void currentViewerProfileId()
      .then((id) => {
        if (!cancelled) setMe(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isOwn = me !== null && me === drop.creatorId;
  const mediaUrl = creatorDropMediaUrl(drop.media);
  const expiry = drop.expiresAt ? timeLeftLabel(drop.expiresAt) : null;

  const runClaim = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await claimWorldDrop(drop.id);
      setClaim(result);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  if (claim) {
    return (
      <CreatorDropFound
        drop={drop}
        rewardLabel={rewardTypeLabel(claim.rewardType)}
        onViewReward={
          claim.rewardType === 'CONTENT_UNLOCK' && claim.rewardRef
            ? () => router.push(`/vault/drop/${claim.rewardRef}`)
            : undefined
        }
        onViewCreator={drop.creatorId ? () => router.push(`/vault/${drop.creatorId}`) : undefined}
        onDone={onClose}
      />
    );
  }

  const alreadyClaimed = drop.claimed;
  const action = dropActionLabel(drop.dropType);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          hapticTap();
          onClose();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text allowFontScaling={false} style={[styles.back, { color: t.textMuted }]}>
          ← Back
        </Text>
      </Pressable>

      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={[styles.hero, styles.heroFallback, { backgroundColor: drop.creatorTint ?? t.surfaceMuted }]} />
      )}

      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        {dropDiscoveryHint({ dropType: drop.dropType, locationLabel: drop.locationLabel })}
      </Text>
      <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
        {dropDiscoveryLine({ creatorName: drop.creatorName, dropType: drop.dropType })}
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {drop.caption}
      </Text>

      {drop.clue ? (
        <View style={[styles.clue, { borderColor: t.borderStrong }]}>
          <Text allowFontScaling={false} style={[styles.clueKicker, { color: t.textMuted }]}>
            CLUE
          </Text>
          <Text allowFontScaling={false} style={[styles.clueBody, { color: t.textSecondary }]}>
            {drop.clue}
          </Text>
        </View>
      ) : null}

      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {[rewardTypeLabel(drop.rewardType), drop.distanceBand, expiry, drop.publishedAt ? `${timeAgo(drop.publishedAt)} ago` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {dropIsEndingSoon(drop.expiresAt) ? (
        <Text allowFontScaling={false} style={[styles.ending, { color: t.danger }]}>
          Ending soon
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isOwn ? (
          <VaultActionButton label="Manage in Studio" onPress={() => router.push('/vault/studio')} />
        ) : alreadyClaimed ? (
          <VaultActionButton
            label={drop.rewardType === 'CONTENT_UNLOCK' && drop.rewardRef ? 'Open the reward' : 'Already found'}
            onPress={() => {
              if (drop.rewardType === 'CONTENT_UNLOCK' && drop.rewardRef) {
                router.push(`/vault/drop/${drop.rewardRef}`);
              }
            }}
          />
        ) : me === null ? (
          <VaultActionButton label="Sign in to find it" onPress={() => router.push('/auth')} />
        ) : drop.claimable ? (
          <GlowButton
            label={busy ? 'Finding…' : action}
            tone="ink"
            onPress={() => void runClaim()}
          />
        ) : (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            This one is not available to you.
          </Text>
        )}
        {drop.creatorId && !isOwn ? (
          <VaultActionButton
            label="View creator"
            tone="quiet"
            onPress={() => router.push(`/vault/${drop.creatorId}`)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  back: { ...typeScale.label, fontWeight: '700' },
  hero: { width: '100%', height: 260, borderRadius: 12, marginTop: space.xs },
  heroFallback: { opacity: 0.9 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: space.sm },
  headline: { ...typeScale.display, fontSize: 28, lineHeight: 31, fontWeight: '800', letterSpacing: -1 },
  title: { ...typeScale.section, fontSize: 18 },
  clue: { gap: 4, paddingLeft: space.md, borderLeftWidth: 2, marginTop: space.xs },
  clueKicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  clueBody: { ...typeScale.body, fontSize: 16, lineHeight: 24 },
  meta: { ...typeScale.meta, marginTop: space.xs },
  ending: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, paddingBottom: space.xl },
});