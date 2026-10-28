import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { fetchProfileById } from '../../services/profileService';
import { fetchDrop, requestPrivateMediaAccess } from '../../services/vaultService';
import { getPublicMediaUrl } from '../../services/mediaService';
import { analytics } from '../../services/analytics';
import { vaultExpiryLabel } from '../../utils/vaultAccess';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { ReadFeedback } from '../shared/ReadFeedback';
import { VaultBackButton } from './VaultBackButton';
import { VaultAvailability } from './VaultAvailability';
import { VaultReaderMedia } from './VaultReaderMedia';

export interface DropReaderProps { dropId: string }
/** Server accessibility selects media; a locked card can only show its explicit public preview. */
export function DropReader({ dropId }: DropReaderProps): React.JSX.Element {
  const router = useRouter(), insets = useSafeAreaInsets(), t = useThemeColors(), { user } = useAuth();
  const scope = `${user?.id ?? 'guest'}:${dropId}`;
  const load = React.useCallback(async () => {
    const drop = await fetchDrop(dropId);
    return drop ? { drop, creator: await fetchProfileById(drop.creatorId) } : null;
  }, [dropId]);
  const read = useRetryableRead(load, scope);
  const loadMedia = React.useCallback(async () => {
    const drop = read.data?.drop;
    if (!drop) return null;
    if (!drop.accessible) {
      const preview = drop.previewMedia;
      return preview ? { url: getPublicMediaUrl(preview.bucket, preview.path), kind: preview.kind } : null;
    }
    if (drop.accessLevel === 'free' && drop.publicMedia) return { url: getPublicMediaUrl(drop.publicMedia.bucket, drop.publicMedia.path), kind: drop.publicMedia.kind };
    if (drop.accessLevel === 'subscriber') { const access = await requestPrivateMediaAccess(drop.id); return { url: access.url, kind: access.mediaKind }; }
    return null;
  }, [read.data]);
  React.useEffect(() => {
    if (read.data) analytics.trackOnce(`vault_drop_opened:${dropId}`, 'vault_drop_opened', { realm: 'vault', vault_access_type: read.data.drop.accessLevel, accessible: read.data.drop.accessible });
  }, [dropId, read.data]);
  return <View style={{ flex: 1, backgroundColor: t.background }}>
    <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenX, gap: space.md, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }}>
      <VaultBackButton />
      {read.status !== 'ready' || !read.data ? <ReadFeedback status={read.status} subject="Drop" retry={read.retry} /> : <>
        <Text style={{ ...typeScale.title, color: t.textPrimary }}>{read.data.drop.caption}</Text>
        {read.data.creator ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${read.data.creator.name}'s Vault`}
          style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => router.push(`/vault/${read.data!.creator!.id}`)}>
          <Text style={{ ...typeScale.label, color: t.textPrimary }}>{read.data.creator.name}</Text>
        </Pressable> : null}
        <VaultAvailability state={read.data.drop.accessible ? read.data.drop.accessLevel === 'free' ? 'free' : 'member' : read.data.drop.previewMedia ? 'preview' : read.data.drop.accessLevel === 'free' ? 'unavailable' : 'locked'} />
        <VaultReaderMedia key={scope} load={loadMedia} scope={scope} />
        {read.data.drop.accessible && read.data.drop.expiresAt ? <Text style={{ color: t.textMuted }}>{vaultExpiryLabel(read.data.drop.expiresAt)}</Text> : null}
        {read.data.drop.collectionIds[0] ? <Pressable accessibilityRole="button" accessibilityLabel="Open Collection"
          style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => router.push(`/vault/collection/${read.data!.drop.collectionIds[0]}`)}>
          <Text style={{ ...typeScale.body, color: t.textSecondary }}>In a Collection</Text>
        </Pressable> : null}
      </>}
    </ScrollView>
  </View>;
}
