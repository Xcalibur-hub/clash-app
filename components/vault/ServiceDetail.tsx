import React from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { fetchProfileById } from '../../services/profileService';
import { fetchCreatorService, vaultCoverUrl } from '../../services/vaultCommerceService';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { space, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { ReadFeedback } from '../shared/ReadFeedback';
import { VaultBackButton } from './VaultBackButton';
import { VaultActionButton } from './VaultActionButton';
import { ServiceRequest } from './ServiceRequest';
import { styles } from './ServiceDetail.styles';

export function ServiceDetail({ serviceId }: { serviceId: string }): React.JSX.Element {
  const router = useRouter(), insets = useSafeAreaInsets(), t = useThemeColors(), { user } = useAuth();
  const [linkState, setLinkState] = React.useState<{ scope: string; busy: boolean; failed: boolean } | null>(null);
  const linkOwner = React.useRef<object | null>(null);
  const load = React.useCallback(async () => {
    const service = await fetchCreatorService(serviceId);
    return service ? { service, creator: await fetchProfileById(service.creatorId) } : null;
  }, [serviceId]);
  const scope = `${user?.id ?? 'guest'}:${serviceId}`;
  React.useEffect(() => () => { linkOwner.current = null; }, [scope]);
  const read = useRetryableRead(load, scope);
  React.useEffect(() => { if (read.status === 'ready') analytics.trackOnce(`vault_service_viewed:${serviceId}`, 'vault_service_viewed', { realm: 'vault' }); }, [read.status, serviceId]);
  if (read.status !== 'ready' || !read.data) return (
    <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
      <VaultBackButton /><ReadFeedback status={read.status} subject="Service" retry={read.retry} />
    </View>
  );
  const { service, creator } = read.data;
  const cover = vaultCoverUrl(service.coverMedia);
  const price = vaultOfferPriceLabel(service);
  const openLink = async () => {
    if (!service.externalUrl || linkOwner.current) return;
    const ticket = {}; linkOwner.current = ticket; setLinkState({ scope, busy: true, failed: false });
    try { await Linking.openURL(service.externalUrl); }
    catch { if (linkOwner.current === ticket) setLinkState({ scope, busy: false, failed: true }); }
    finally { if (linkOwner.current === ticket) { linkOwner.current = null; setLinkState(previous => ({ scope, busy: false, failed: previous?.scope === scope && previous.failed })); } }
  };
  return <View style={[styles.screen, { backgroundColor: t.background }]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <VaultBackButton />
      <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
        {cover ? <Image source={{ uri: cover }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        <View style={styles.scrim} />
        <Text style={styles.kicker}>SESSION</Text><Text style={styles.title}>{service.title}</Text>
      </View>
      {creator ? <Pressable style={styles.identity} accessibilityRole="button" accessibilityLabel={`Open ${creator.name}'s Vault`} onPress={() => router.push(`/vault/${creator.id}`)}>
        <Avatar name={creator.name} tint={creator.tint} size={44} /><Text style={[styles.name, { color: t.textPrimary, flex: 1 }]}>{creator.name}</Text>
      </Pressable> : null}
      <Text style={[styles.body, { color: t.textSecondary }]}>{service.description}</Text>
      <Text style={[styles.meta, { color: t.textMuted }]}>{service.deliveryType.replace('_', ' ')} ? {price}</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>This is a request, not a booking or purchase. In-app purchases and new subscriptions are unavailable.</Text>
      {service.externalUrl ? <VaultActionButton label="Open link" busy={linkState?.scope === scope && linkState.busy} onPress={() => void openLink()} /> : null}
      {linkState?.scope === scope && linkState.failed ? <Text accessibilityLiveRegion="polite" style={{ color: t.textSecondary }}>Couldn't open the link. Try again.</Text> : null}
      <ServiceRequest key={scope} serviceId={service.id} />
    </ScrollView>
  </View>;
}
