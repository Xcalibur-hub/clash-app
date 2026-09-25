/** Drawer link sections: Vault hero, hood shortcuts, archive + rules. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { REALM_ROUTES } from './realmRoutes';
import { hoodQuickLinks, SidebarLink } from './SidebarLinks';
import { sidebar as s } from './sidebarStyles';
import { useRealmSwitch } from './useRealmSwitch';
import { HOODS } from '../../data/hoods';
import { showNotice, useClash, type HoodId } from '../../store';
import { accent } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { AnalyticsIcon, HashIcon, TrophyIcon, VaultIcon } from '../shared/icons';

export function SidebarBody({ closeThen }: { closeThen: (run: () => void) => void }): React.JSX.Element {
  const { shiftTo } = useRealmSwitch();
  const { dispatch } = useClash();
  const router = useRouter();

  const openHood = React.useCallback(
    (id: HoodId): void => {
      closeThen(() => router.replace({ pathname: '/(tabs)', params: { hood: id } }));
    },
    [closeThen, router],
  );
  const hoods = hoodQuickLinks(HOODS.slice(0, 3), openHood, HashIcon);

  return (
    <>
      <View style={s.section}>
        <Text allowFontScaling={false} style={s.sectionLabel}>THE VAULT</Text>
        <Pressable
          onPress={() => {
            hapticTap();
            closeThen(() => shiftTo('vault', REALM_ROUTES.vaultHome));
          }}
          accessibilityRole="button"
          accessibilityLabel="Open The Vault"
          style={({ pressed }) => [s.vaultCard, pressed && s.pressed]}
        >
          <View style={s.vaultRow}>
            <VaultIcon size={18} color={accent.gold} strokeWidth={2.4} />
            <Text allowFontScaling={false} style={s.vaultTitle}>The Vault</Text>
          </View>
          <Text allowFontScaling={false} style={s.vaultSub}>Paid drops · sponsor radar · analytics</Text>
        </Pressable>
      </View>

      <View style={s.section}>
        <Text allowFontScaling={false} style={s.sectionLabel}>HOODS</Text>
        {hoods.map((hood) => (
          <SidebarLink key={hood.id} title={hood.title} sub={hood.sub} icon={hood.icon} onPress={hood.onPress} />
        ))}
      </View>

      <View style={s.section}>
        <Text allowFontScaling={false} style={s.sectionLabel}>ARCHIVE & RULES</Text>
        <SidebarLink
          title="Hall of Fame"
          sub="Legendary takes, immortalised"
          icon={TrophyIcon}
          onPress={() => closeThen(() => router.push('/(tabs)/explore'))}
        />
        <SidebarLink
          title="Platform Constitution"
          sub="Roast the take, not the human"
          icon={AnalyticsIcon}
          onPress={() => dispatch(showNotice('Prototype: the constitution ships with the backend.'))}
        />
      </View>
    </>
  );
}
