/** Vault mastheads (§17, §21, §22): calmer premium voice, same balances. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { CoinIcon, FlameIcon, VaultIcon } from '../shared/icons';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import type { Creator } from '../../store/types';
import { tap as hapticTap } from '../../utils/haptics';

export interface ViewerChip {
  name: string;
  tint: string;
  reputation: number;
  coins: number;
}

export interface VaultHeaderProps {
  title: string;
  subtitle: string;
  /** Viewer balances shown on the full masthead; list screens pass `count`. */
  viewer?: ViewerChip;
  count?: number;
  onOpenProfile?: () => void;
}

/** Vault masthead (§17): calmer premium voice, same live balances. */
export function VaultHeader({ title, subtitle, viewer, count, onOpenProfile }: VaultHeaderProps): React.JSX.Element {
  const stat = (value: number, label: string, Icon: typeof FlameIcon, tint: string): React.JSX.Element | null => {
    if (!viewer) return null;
    return (
      <View style={styles.stat} accessibilityLabel={`${value} ${label}`}>
        <Icon size={12} color={tint} strokeWidth={2.6} />
        <Text allowFontScaling={false} style={styles.statText}>
          {compact(value)}
        </Text>
      </View>
    );
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.brandRow}>
          <VaultIcon size={20} color={ink.secondary} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.brand}>
            {title}
          </Text>
        </View>
        <View style={styles.actions}>
          {stat(viewer?.reputation ?? 0, 'reputation', FlameIcon, ink.secondary)}
          {stat(viewer?.coins ?? 0, 'clash coins', CoinIcon, ink.secondary)}
          {typeof count === 'number' ? <Chip label={`${count} LIVE`} tone="mint" data /> : null}
          {viewer && onOpenProfile ? (
            <Pressable
              onPress={() => {
                hapticTap();
                onOpenProfile();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open your profile, ${viewer.name}`}
            >
              <Avatar name={viewer.name} tint={viewer.tint} size={38} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text allowFontScaling={false} style={styles.headline}>
        {subtitle}
      </Text>
    </View>
  );
}

export function CreatorMeta({ creator, rating }: { creator: Creator; rating?: number }): React.JSX.Element {
  return (
    <View style={styles.metaRow}>
      <Chip label={`${compact(creator.followers)} FANS`} tone="neutral" data />
      <Text allowFontScaling={false} style={styles.metaText}>
        {compact(creator.reputation)} REP
      </Text>
      {typeof rating === 'number' ? (
        <Text allowFontScaling={false} style={styles.metaText}>
          ★ {rating.toFixed(1)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingTop: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { ...typeScale.title, fontSize: 22, color: ink.primary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 1,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statText: { ...typeScale.data, fontSize: 11.5, color: ink.primary },
  headline: { ...typeScale.meta, color: ink.secondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  metaText: { ...typeScale.meta, color: ink.tertiary },
});
