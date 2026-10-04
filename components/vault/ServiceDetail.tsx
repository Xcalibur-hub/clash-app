import React from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileById } from '../../services/profileService';
import {
  fetchCreatorService,
  requestCreatorService,
  vaultCoverUrl,
} from '../../services/vaultCommerceService';
import type { CreatorService } from '../../services/vaultCommerceMappers';
import type { User } from '../../store';
import { showNotice, useClash } from '../../store';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

export function ServiceDetail({ serviceId }: { serviceId: string }): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { dispatch } = useClash();
  const [service, setService] = React.useState<CreatorService | null>(null);
  const [creator, setCreator] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchCreatorService(serviceId);
        if (!next) {
          if (!cancelled) setLoading(false);
          return;
        }
        const profile = await fetchProfileById(next.creatorId);
        if (cancelled) return;
        setService(next);
        setCreator(profile);
        analytics.trackOnce(`vault_service_viewed:${serviceId}`, 'vault_service_viewed', {
          realm: 'vault',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState icon={VaultIcon} title="Service unavailable" body="This service could not be opened." />
      </View>
    );
  }

  const cover = vaultCoverUrl(service.coverMedia);
  const price = vaultOfferPriceLabel({
    accessType: service.accessType,
    priceAmountMinor: service.priceAmountMinor,
    currency: service.currency,
    externalUrl: service.externalUrl,
  });
  const delivery =
    service.deliveryType === 'online'
      ? 'Online'
      : service.deliveryType === 'in_person'
        ? 'In person'
        : service.deliveryType === 'external'
          ? 'External'
          : 'Custom';

  const sendRequest = async (): Promise<void> => {
    if (busy || message.trim().length === 0) return;
    setBusy(true);
    try {
      await requestCreatorService(service.id, message.trim());
      analytics.track('vault_service_requested', { realm: 'vault' });
      dispatch(showNotice('Request sent.'));
      setMessage('');
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
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
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.scrim} />
          <Text allowFontScaling={false} style={styles.kicker}>
            SESSION
          </Text>
          <Text allowFontScaling={false} style={styles.title}>
            {service.title}
          </Text>
        </View>

        {creator ? (
          <Pressable style={styles.identity} onPress={() => router.push(`/vault/${creator.id}`)}>
            <Avatar name={creator.name} tint={creator.tint} size={44} />
            <View>
              <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
                {creator.name}
              </Text>
              <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]}>
                @{creator.handle}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {service.description ? (
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            {service.description}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {delivery} · {price}
        </Text>

        {service.externalUrl ? (
          <VaultActionButton
            label="Open link"
            onPress={() => {
              void Linking.openURL(service.externalUrl!);
            }}
          />
        ) : null}

        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Request
        </Text>
        <TextInput
          value={message}
          onChangeText={(next) => setMessage(next.slice(0, 500))}
          multiline
          maxLength={500}
          placeholder="A short note for the creator"
          placeholderTextColor={t.textMuted}
          style={[
            styles.input,
            {
              color: t.textPrimary,
              borderColor: t.border,
              backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.05)' : t.inputBackground,
            },
          ]}
        />
        <VaultActionButton
          label={busy ? 'Sending…' : 'Request session'}
          onPress={() => void sendRequest()}
        />
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
      style={[
        styles.back,
        {
          backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.08)' : t.surface,
          borderColor: t.scheme === 'dark' ? 'transparent' : t.border,
        },
      ]}
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
  hero: {
    aspectRatio: 4 / 5,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: 6,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,9,11,0.42)' },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(250,250,248,0.8)',
    letterSpacing: 1,
    zIndex: 1,
  },
  title: {
    ...typeScale.display,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -1,
    color: '#FAFAF8',
    zIndex: 1,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typeScale.cardTitle },
  handle: { ...typeScale.meta },
  body: { ...typeScale.body },
  meta: { ...typeScale.caption, letterSpacing: 0.4 },
  label: { ...typeScale.caption, letterSpacing: 0.6, marginTop: space.sm },
  input: {
    minHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space.md,
    ...typeScale.body,
    textAlignVertical: 'top',
  },
});
