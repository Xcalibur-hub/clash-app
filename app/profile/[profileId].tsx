import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileScreen } from '../../components/profile/ProfileScreen';
import { BackIcon } from '../../components/shared/icons';
import { layout, space, typeScale, useThemeColors } from '../../theme';

/** Public profile route — any profile, self or other, shareable by id. */
export default function PublicProfileRoute(): React.JSX.Element {
  const { profileId } = useLocalSearchParams<{ profileId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const id = Array.isArray(profileId) ? profileId[0] : profileId;

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <BackIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Profile
        </Text>
      </View>
      {id ? <ProfileScreen profileId={id} hideSafeTop /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: space.md,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  title: { ...typeScale.cardTitle },
});
