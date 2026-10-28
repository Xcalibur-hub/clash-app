import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppearanceRow } from '../components/profile/AppearanceRow';
import { useAuth } from '../store/AuthProvider';
import { useClash } from '../store';
import { layout, space, typeScale, useThemeColors } from '../theme';

export default function SettingsScreen(): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), router = useRouter();
  const { signedIn, loading } = useAuth();
  const { state } = useClash();
  const [helpOpen, setHelpOpen] = React.useState(false);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.back}
        onPress={() => router.canGoBack() ? router.back() : router.replace(state.realm === 'vault' ? '/(vault)' : '/(tabs)')}>
        <Text style={[styles.label, { color: t.textPrimary }]}>‹ Back</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Settings</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Your account and your experience.</Text>
      <View style={[styles.section, { borderColor: t.border }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: t.textPrimary }]}>Account</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>
          {loading ? 'Checking your account…' : signedIn ? 'Edit your profile, interests or sign out from your profile.' : 'Sign in to manage your profile.'}
        </Text>
        <Pressable disabled={loading} accessibilityRole="button" accessibilityState={{ disabled: loading }} style={styles.row}
          onPress={() => router.push(signedIn ? '/(tabs)/profile' : '/auth')}>
          <Text style={[styles.label, { color: loading ? t.textMuted : t.textPrimary }]}>{signedIn ? 'Open profile' : 'Sign in'}</Text>
        </Pressable>
      </View>
      <View style={[styles.section, { borderColor: t.border }]}><AppearanceRow /></View>
      <View style={[styles.section, { borderColor: t.border }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: t.textPrimary }]}>Privacy & safety</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>Block or report from a profile or an eligible conversation. World explains its approximate map and optional one-time location access.</Text>
        <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push('/world')}>
          <Text style={[styles.label, { color: t.textPrimary }]}>Open World</Text>
        </Pressable>
      </View>
      <View style={[styles.section, { borderColor: t.border }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: helpOpen }} style={styles.row} onPress={() => setHelpOpen(open => !open)}>
          <Text style={[styles.heading, { color: t.textPrimary }]}>Using CLASH {helpOpen ? '−' : '+'}</Text>
        </Pressable>
        {helpOpen ? <Text style={[styles.body, { color: t.textSecondary }]}>Arena is for Takes and debates. Explore contains World, Play and Meet. Vault is for creator content. Use each screen's Back control to return. A locked or unavailable item does not mean a purchase was made.</Text> : null}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: space.sm },
  title: { ...typeScale.display }, heading: { ...typeScale.cardTitle },
  body: { ...typeScale.body }, label: { ...typeScale.label },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm },
  row: { minHeight: 44, justifyContent: 'center', paddingVertical: space.sm },
});
