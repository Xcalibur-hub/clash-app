import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { completeCourseLesson } from '../../services/vaultCommerceService';
import { analytics } from '../../services/analytics';
import { space, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export function LessonCompletion({ lessonId }: { lessonId: string }): React.JSX.Element {
  const { user } = useAuth(), router = useRouter(), t = useThemeColors();
  const [busy, setBusy] = React.useState(false), [done, setDone] = React.useState(false), [failed, setFailed] = React.useState(false);
  const active = React.useRef(true), pending = React.useRef(false);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const complete = async () => {
    if (pending.current || done || !user) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      await completeCourseLesson(lessonId);
      if (active.current) { setDone(true); analytics.track('vault_lesson_completed', { realm: 'vault' }); }
    } catch { if (active.current) setFailed(true); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  if (!user) return <VaultActionButton label="Sign in to track progress" onPress={() => router.push('/auth')} />;
  return <View style={{ gap: space.sm }}>
    <VaultActionButton label={done ? 'Completed' : busy ? 'Saving…' : 'Mark complete'} disabled={done} busy={busy} onPress={() => void complete()} />
    {failed ? <Text accessibilityLiveRegion="polite" style={{ color: t.textSecondary }}>Couldn't save progress. Try again.</Text> : null}
  </View>;
}
