import { releaseAllows, releaseUnavailableCopy } from '../../utils/releaseScope';
import React from 'react';
import { Linking, Text, View } from 'react-native';
import type { CreatorProduct } from '../../services/vaultCommerceMappers';
import { analytics } from '../../services/analytics';
import { space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

/** Product records provide an external URL, not a private downloadable-asset entitlement. */
export function ProductAction({ product }: { product: CreatorProduct }): React.JSX.Element {
  const t = useThemeColors();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const active = React.useRef(true), pending = React.useRef(false);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const open = async () => {
    if (product.accessType !== 'free' && !releaseAllows('commerce', 'admit')) return;
    if (pending.current || !product.externalUrl) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      await Linking.openURL(product.externalUrl);
      if (active.current) analytics.track('vault_product_external_opened', { realm: 'vault' });
    } catch { if (active.current) setFailed(true); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  if (product.accessType !== 'free' && !releaseAllows('commerce', 'admit')) return <Text style={{ color: t.textSecondary }}>{releaseUnavailableCopy('commerce')}</Text>;
  if (!product.externalUrl) return (
    <View style={{ gap: space.sm }}>
      <Text style={{ ...typeScale.label, color: t.textSecondary }}>
        {product.accessType === 'free' ? 'Free listing' : 'Delivery unavailable'}
      </Text>
      <Text style={{ ...typeScale.body, color: t.textMuted }}>
        No delivery link is provided in this listing. No download or purchase is available here.
      </Text>
    </View>
  );
  return <View style={{ gap: space.sm }}>
    <Text style={{ color: t.textMuted }}>Opens outside CLASH.</Text>
    <VaultActionButton label={busy ? 'Opening…' : failed ? 'Try opening store again' : 'Open store'} busy={busy} onPress={() => void open()} />
    {failed ? <Text accessibilityLiveRegion="polite" style={{ color: t.textSecondary }}>Couldn't open this link. You can try again.</Text> : null}
  </View>;
}
