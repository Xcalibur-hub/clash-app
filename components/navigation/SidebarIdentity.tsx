/** Viewer identity + footer: avatar, rank, rep/coins, settings, version. */
import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { sidebar as s } from './sidebarStyles';
import { selectViewer, showNotice, useClash } from '../../store';
import { accent, ink } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { CoinIcon, CrownIcon, ScaleIcon, SettingsIcon } from '../shared/icons';

const VERSION_LABEL = '2.0.0';

export function SidebarIdentity({ closeThen }: { closeThen: (run: () => void) => void }): React.JSX.Element {
  const { state } = useClash();
  const viewer = selectViewer(state);
  const router = useRouter();
  return (
    <View style={s.identity}>
      <Pressable
        onPress={() => {
          hapticTap();
          closeThen(() => router.push('/(tabs)/profile'));
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open your profile, @${viewer.handle}`}
        style={s.identityRow}
      >
        <Avatar name={viewer.name} tint={viewer.tint} size={44} />
        <View>
          <Text allowFontScaling={false} style={s.name}>{viewer.name}</Text>
          <Text allowFontScaling={false} style={s.handle}>@{viewer.handle}</Text>
        </View>
      </Pressable>
      <View style={s.chipsRow}>
        <Chip label={viewer.rank.toUpperCase()} icon={CrownIcon} tone="gold" data />
        <Chip label={`${compact(viewer.reputation)} REP`} icon={ScaleIcon} tone="neutral" data />
      </View>
      <View style={s.countersRow}>
        <View style={s.counter}>
          <CoinIcon size={13} color={accent.gold} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={s.counterText}>{compact(viewer.coins)}</Text>
        </View>
      </View>
    </View>
  );
}

export function SidebarFooter(): React.JSX.Element {
  const { dispatch } = useClash();
  return (
    <View style={s.footer}>
      <Pressable
        onPress={() => dispatch(showNotice('Prototype: settings arrive with the backend.'))}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        style={s.settingsRow}
      >
        <SettingsIcon size={17} color={ink.secondary} strokeWidth={2.3} />
        <Text allowFontScaling={false} style={s.settingsText}>Settings</Text>
      </Pressable>
      <Text allowFontScaling={false} style={s.version}>CLASH {VERSION_LABEL}</Text>
    </View>
  );
}
