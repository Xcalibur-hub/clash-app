import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectViewer, useClash } from '../../store';
import { accent, ink, radius, space, tint, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { CountUp } from '../shared/CountUp';
import { CoinIcon, FlameIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

/** Live balance chip: the number rolls up when a clash pays out (spec §11). */
function LiveStat({
  value,
  tone,
  icon: Icon,
  label,
}: {
  value: number;
  tone: string;
  icon: typeof CoinIcon;
  label: string;
}): React.JSX.Element {
  return (
    <View style={[styles.stat, { borderColor: tone }]} accessibilityLabel={label}>
      <Icon size={12} color={tone} strokeWidth={2.6} />
      <CountUp
        value={value}
        compactMode
        animateOnMount={false}
        durationMs={760}
        style={[styles.statText, { color: tone }]}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * Arena masthead (reference "Arena Home", screen 5): the CLASH wordmark on the
 * left, the viewer's avatar on the right. Nothing else competes for the eye.
 */
export function ArenaHeader(): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.brand}>
        CLASH
      </Text>
      <Pressable
        onPress={() => {
          hapticTap();
          router.push('/(tabs)/profile');
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open your profile, @${viewer.handle}`}
        style={styles.avatar}
      >
        <Avatar name={viewer.name} tint={viewer.tint} size={40} />
      </Pressable>
    </View>
  );
}

/**
 * The viewer's live reputation and coin balances. Kept as a separate block so the
 * masthead stays as quiet as the reference while payouts still animate on screen.
 */
export function ArenaBalance(): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);

  return (
    <View style={styles.balanceRow}>
      <LiveStat
        value={viewer.reputation}
        tone={accent.a}
        icon={FlameIcon}
        label={`${viewer.reputation} reputation`}
      />
      <LiveStat
        value={viewer.coins}
        tone={accent.gold}
        icon={CoinIcon}
        label={`${viewer.coins} clash coins`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: {
    ...typeScale.title,
    fontSize: 25,
    color: ink.primary,
    letterSpacing: 2.4,
  },
  avatar: { borderRadius: radius.pill },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 1,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: tint.neutralSoft,
  },
  statText: { ...typeScale.data, fontSize: 11.5 },
});
