import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckoutSheet } from '../../components/vault/CheckoutSheet';
import { DropRow } from '../../components/vault/DropRow';
import { vault as s } from '../../components/vault/vaultStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Avatar } from '../../components/shared/Avatar';
import { Chip } from '../../components/shared/Chip';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlassCard } from '../../components/shared/GlassCard';
import { GlowButton } from '../../components/shared/GlowButton';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { BackIcon, VaultIcon } from '../../components/shared/icons';
import {
  selectDropsForCreator,
  selectUnlockStatus,
  unlockDrop,
  useClash,
} from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import type { Drop } from '../../store/types';

/** Creator deep-link (spec §18) — public vs exclusive tiers + mock checkout. */
export default function CreatorScreen(): React.JSX.Element {
  const { creatorId } = useLocalSearchParams<{ creatorId?: string }>();
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [paying, setPaying] = React.useState<Drop | null>(null);
  const creator = state.creators.find((item) => item.id === creatorId);
  const drops = selectDropsForCreator(state, String(creatorId));
  const publicDrops = drops.filter((drop) => drop.tier === 'public');
  const exclusiveDrops = drops.filter((drop) => drop.tier === 'exclusive');

  if (!creator) {
    return (
      <AuroraBackground tone="calm">
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon={VaultIcon}
            title="Creator not found."
            body="This vault door leads nowhere. Head back to the trending list."
            actionLabel="BACK TO VAULT"
            onAction={() => router.back()}
          />
        </View>
      </AuroraBackground>
    );
  }

  return (
    <AuroraBackground tone="calm">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <GlowButton
          label="BACK"
          onPress={() => router.back()}
          icon={BackIcon}
          tone="glass"
          compact
          style={styles.back}
        />
        <GlassCard level="regular" corner={radius.xl} contentStyle={styles.hero}>
          <Avatar name={creator.name} tint={creator.tint} size={64} />
          <Text allowFontScaling={false} style={styles.name}>{creator.name}</Text>
          <Text allowFontScaling={false} style={styles.handle}>@{creator.handle}</Text>
          <Text allowFontScaling={false} style={styles.tagline}>{creator.tagline}</Text>
          <View style={styles.stats}>
            <Chip label={`${compact(creator.followers)} FANS`} tone="violet" data />
            <Chip label={`${publicDrops.length} PUBLIC`} tone="mint" data />
            <Chip label={`${exclusiveDrops.length} EXCLUSIVE`} tone="gold" data />
          </View>
        </GlassCard>

        <SectionHeading eyebrow="FREELY ACCESSIBLE" title="Public drops" />
        {publicDrops.map((drop) => (
          <DropRow
            key={drop.id}
            drop={drop}
            locked={false}
            onOpen={() => dispatch(unlockDrop(drop.id))}
          />
        ))}
        {publicDrops.length === 0 ? (
          <Text allowFontScaling={false} style={styles.note}>No public drops yet.</Text>
        ) : null}

        <SectionHeading eyebrow="MEMBERS ONLY" title="Exclusive drops" />
        {exclusiveDrops.map((drop) => {
          const locked = selectUnlockStatus(state, drop.id) !== 'unlocked';
          return (
            <DropRow
              key={drop.id}
              drop={drop}
              locked={locked}
              onOpen={() => {
                if (locked) {
                  setPaying(drop);
                }
              }}
            />
          );
        })}
      </ScrollView>

      <CheckoutSheet
        drop={paying}
        onClose={() => setPaying(null)}
        onUnlocked={(dropId) => {
          hapticPress();
          dispatch(unlockDrop(dropId));
          setPaying(null);
        }}
      />
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  center: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space.sm, borderRadius: radius.xl, padding: space.xl },
  name: { ...typeScale.section, color: ink.primary, fontSize: 24 },
  handle: { ...typeScale.caption, color: ink.tertiary },
  tagline: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  note: { ...typeScale.body, color: ink.tertiary },
});
