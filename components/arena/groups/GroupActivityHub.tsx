import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useThemeColors } from '../../../theme';
import type { ArenaCrew } from '../../../utils/arenaCrewPayload';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { GroupButton } from './GroupButton';
import { GroupMissionRehearsal } from './GroupMissionRehearsal';

export function GroupActivityHub({ crew, identity, onMembers }: {
  crew: ArenaCrew;
  identity: string;
  onMembers: () => void;
}): React.JSX.Element {
  const t = useThemeColors(), router = useRouter();
  const demo = arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant);
  return <View style={styles.hub}>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Our shared purpose</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>{crew.bio || 'This group has not added a purpose yet.'}</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>
        {crew.viewer.isMember ? `Your role: ${crew.viewer.role?.toLowerCase() ?? 'member'}.` : 'You are viewing this group. Browsing does not join it.'}
      </Text>
    </View>
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Arena, together</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Group-linked Arena activity is not available yet. This view cannot identify this group's live, upcoming or settled Clashes.</Text>
      <GroupButton secondary label="Explore Arena topics" onPress={() => router.push('/arena/topics')} />
      <Text style={[styles.caption, { color: t.textMuted }]}>Opens Arena discovery, not a group feed.</Text>
    </View>
    {demo ? <GroupMissionRehearsal key={`${identity}:${crew.id}`} /> : null}
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Take part today</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Explore members and open their public profiles. New membership, invitations and group posting are unavailable in this release.</Text>
      <GroupButton secondary label="Explore group members" onPress={onMembers} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hub: { gap: 24 },
  section: { gap: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 18, gap: 12 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 },
});
