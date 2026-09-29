import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useClash } from '../../store';
import { ProfileScreen } from '../../components/profile/ProfileScreen';
import { EmptyState } from '../../components/shared/EmptyState';
import { UserIcon } from '../../components/shared/icons';
import { color } from '../../theme';

/** Self profile tab — the signed-in viewer's social identity. */
export default function ProfileTab(): React.JSX.Element {
  const { state } = useClash();
  const { signedIn, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (loading) return <View style={styles.screen} />;

  if (!signedIn) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          icon={UserIcon}
          title="Your profile"
          body="Sign in to see your Takes, replies and Clash history."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </View>
    );
  }

  return <ProfileScreen profileId={state.viewer.id} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
});
