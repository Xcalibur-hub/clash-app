import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileById } from '../../services/profileService';
import { fetchCreatorProduct, vaultCoverUrl } from '../../services/vaultCommerceService';
import type { CreatorProduct } from '../../services/vaultCommerceMappers';
import type { User } from '../../store';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

export function ProductDetail({ productId }: { productId: string }): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const [product, setProduct] = React.useState<CreatorProduct | null>(null);
  const [creator, setCreator] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchCreatorProduct(productId);
        if (!next) {
          if (!cancelled) setLoading(false);
          return;
        }
        const profile = await fetchProfileById(next.creatorId);
        if (cancelled) return;
        setProduct(next);
        setCreator(profile);
        analytics.trackOnce(`vault_product_viewed:${productId}`, 'vault_product_viewed', {
          realm: 'vault',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState icon={VaultIcon} title="Product unavailable" body="This product could not be opened." />
      </View>
    );
  }

  const cover = vaultCoverUrl(product.coverMedia);
  const price = vaultOfferPriceLabel({
    accessType: product.accessType,
    priceAmountMinor: product.priceAmountMinor,
    currency: product.currency,
    externalUrl: product.externalUrl,
  });

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
            ARTIFACT
          </Text>
          <Text allowFontScaling={false} style={styles.title}>
            {product.title}
          </Text>
        </View>
        {creator ? (
          <Pressable style={styles.identity} onPress={() => router.push(`/vault/${creator.id}`)}>
            <Avatar name={creator.name} tint={creator.tint} size={44} />
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
              @{creator.handle}
            </Text>
          </Pressable>
        ) : null}
        {product.description ? (
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            {product.description}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {product.productType.toUpperCase()} · {price}
        </Text>
        {product.accessType === 'paid' && !product.externalUrl ? (
          <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
            Checkout isn't available in this build. Nothing was charged.
          </Text>
        ) : null}
        {product.externalUrl ? (
          <>
            <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
              Opens outside CLASH.
            </Text>
            <VaultActionButton
              label="Open store"
              onPress={() => {
                analytics.track('vault_product_external_opened', { realm: 'vault' });
                void Linking.openURL(product.externalUrl!);
              }}
            />
          </>
        ) : product.accessType === 'free' ? (
          <VaultActionButton label="Included" tone="quiet" onPress={() => undefined} />
        ) : (
          <VaultActionButton label="Unavailable" tone="quiet" onPress={() => undefined} />
        )}
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
    aspectRatio: 5 / 4,
    borderRadius: radius.xxl,
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
  body: { ...typeScale.body },
  meta: { ...typeScale.caption, letterSpacing: 0.4 },
  note: { ...typeScale.meta },
});
