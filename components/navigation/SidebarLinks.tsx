/** Bit-sized drawer links inside the vault of the sidebar. */
import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { HoodId } from '../../store';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { ink } from '../../theme';
import { sidebar as s } from './sidebarStyles';

export interface SidebarLinkProps {
  title: string;
  sub: string;
  icon: LucideIcon;
  onPress: () => void;
}

export function SidebarLink({ title, sub, icon: Icon, onPress }: SidebarLinkProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.link, pressed && s.pressed]}
    >
      <Icon size={17} color={ink.secondary} strokeWidth={2.3} />
      <View>
        <Text allowFontScaling={false} style={s.linkTitle}>{title}</Text>
        <Text allowFontScaling={false} style={s.linkSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

interface HoodQuickLink extends SidebarLinkProps {
  id: HoodId;
}

export function hoodQuickLinks(
  hoods: readonly { id: HoodId; name: string; members: number }[],
  openHood: (id: HoodId) => void,
  icon: LucideIcon,
): HoodQuickLink[] {
  return hoods.map((hood) => ({
    id: hood.id,
    title: hood.name,
    sub: `${compact(hood.members)} members`,
    icon,
    onPress: () => openHood(hood.id),
  }));
}
