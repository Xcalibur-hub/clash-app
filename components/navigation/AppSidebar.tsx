/**
 * Slide-out drawer (X/Discord-style): identity, Vault hero, hood shortcuts,
 * archive links, settings + version. 60fps Reanimated slide from the left.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { IconButton } from '../shared/IconButton';
import { MenuIcon } from '../shared/icons';
import { useSidebar } from './SidebarContext';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter, SidebarIdentity } from './SidebarIdentity';
import { sidebar as s } from './sidebarStyles';
import { space } from '../../theme';

const CLOSING_MS = 230;
const OPENING_MS = 260;

export function AppSidebar(): React.JSX.Element | null {
  const { isOpen, close } = useSidebar();
  const insets = useSafeAreaInsets();
  const slide = useSharedValue(0);
  const [visible, setVisible] = React.useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const width = windowWidth * 0.8;

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      slide.value = withTiming(1, { duration: OPENING_MS, easing: Easing.out(Easing.cubic) });
    } else if (visible) {
      slide.value = withTiming(0, { duration: CLOSING_MS, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(setVisible)(false);
      });
    }
    // `slide` is a stable shared value; toggling it never re-runs on redraws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, visible]);

  const scrim = useAnimatedStyle(() => ({ opacity: slide.value * 0.6 }));
  const panel = useAnimatedStyle(() => ({
    width,
    transform: [{ translateX: (slide.value - 1) * width }],
  }));

  const closeThen = React.useCallback(
    (run: () => void): void => {
      close();
      setTimeout(run, CLOSING_MS);
    },
    [close],
  );

  if (!visible) return null;

  return (
    <View style={s.root}>
      <Animated.View style={[s.scrim, scrim]}>
        <Pressable style={s.scrimTouch} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View style={[s.panel, panel, { paddingTop: insets.top + space.md }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.head}>
            <Text allowFontScaling={false} style={s.menuTitle}>MENU</Text>
            <IconButton icon={MenuIcon} onPress={close} label="Close menu" size={36} />
          </View>
          <SidebarIdentity closeThen={closeThen} />
          <SidebarBody closeThen={closeThen} />
          <SidebarFooter />
        </ScrollView>
      </Animated.View>
    </View>
  );
}
