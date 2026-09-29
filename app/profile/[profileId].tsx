import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileScreen } from '../../components/profile/ProfileScreen';
import { BackIcon } from '../../components/shared/icons';
import { color, ink, layout, space, typeScale } from '../../theme';

/** Public profile route — any profile, self or other, shareable by id. */
export default function PublicProfileRoute(): React.JSX.Element {
  const { profileId } = useLocalSearchParams<{ profileId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const id = Array.isArray(profileId) ? profileId[0] : profileId;

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <BackIcon size={22} color={ink.primary} strokeWidth={2.2} />
        </Pressable>
        <Text allowFontScaling={false} style={styles.title}>
          Profile
        </Text>
      </View>
      {id ? <ProfileScreen profileId={id} hideSafeTop /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: space.md,
  },
  back: { width: 40, height: 40, justifyContent: 'center' },
  title: { ...typeScale.cardTitle, color: ink.primary },
});
