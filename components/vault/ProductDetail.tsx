import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileById } from '../../services/profileService';
import { fetchCreatorProduct, vaultCoverUrl } from '../../services/vaultCommerceService';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { analytics } from '../../services/analytics';
import { vaultOfferPriceLabel } from '../../utils/vaultMoney';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { ReadFeedback } from '../shared/ReadFeedback';
import { ProductAction } from './ProductAction';
import { VaultBackButton } from './VaultBackButton';

export function ProductDetail({ productId }: { productId: string }): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { user } = useAuth();
  const load = React.useCallback(async () => {
    const product = await fetchCreatorProduct(productId);
    if (!product) return null;
    const creator = await fetchProfileById(product.creatorId);
    return { product, creator };
  }, [productId]);
  const read = useRetryableRead(load, `${user?.id ?? 'guest'}:${productId}`);
  React.useEffect(() => {
    if (read.status === 'ready') analytics.trackOnce(`vault_product_viewed:${productId}`, 'vault_product_viewed', { realm: 'vault' });
  }, [read.status, productId]);
  if (read.status !== 'ready' || !read.data) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <VaultBackButton />
        <ReadFeedback status={read.status} subject="Product" retry={read.retry} />
      </View>
    );
  }
  const { product, creator } = read.data;

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
        <VaultBackButton />
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.scrim} />
          <Text style={styles.kicker}>
            ARTIFACT
          </Text>
          <Text style={styles.title}>
            {product.title}
          </Text>
        </View>
        {creator ? (
          <Pressable style={styles.identity} accessibilityRole="button" accessibilityLabel={`Open ${creator.name}'s Vault`} onPress={() => router.push(`/vault/${creator.id}`)}>
            <Avatar name={creator.name} tint={creator.tint} size={44} />
            <Text style={[styles.name, { color: t.textPrimary, flex: 1 }]}>
              @{creator.handle}
            </Text>
          </Pressable>
        ) : null}
        {product.description ? (
          <Text style={[styles.body, { color: t.textSecondary }]}>
            {product.description}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: t.textMuted }]}>
          {product.productType.toUpperCase()} · {price}
        </Text>
        {product.accessType === 'paid' && !product.externalUrl ? (
          <Text style={[styles.note, { color: t.textMuted }]}>
            Checkout isn't available in this build. Nothing was charged.
          </Text>
        ) : null}
        <ProductAction key={product.id} product={product} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  hero: {
    minHeight: 240,
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
