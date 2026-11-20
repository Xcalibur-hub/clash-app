import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../store/AuthProvider';
import { currentUserId } from '../../services/supabaseClient';
import { currentViewerProfileId } from '../../services/apiService';
import { fetchClashView, fetchClashReputationEvents } from '../../services/clashEngineService';
import { typeScale, useThemeColors } from '../../theme';

type Read = { owner: string; clash: string; ballot: 'A' | 'B' | null; reputation: number; coins: number };

/** Caller-scoped historical reads only. Opening a result never awards or judges. */
export function DuelPersonalResult({ clashId }: { clashId: string }): React.JSX.Element | null {
  const { user } = useAuth(), t = useThemeColors(), owner = user?.id ?? null;
  const [read, setRead] = React.useState<Read | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const scope = `${owner}:${clashId}`;
  React.useEffect(() => {
    let active = true;
    setRead(null); setFailed(null);
    if (!owner) return;
    const current = async (): Promise<boolean> => active && await currentUserId() === owner && active;
    void (async () => {
      try {
        if (!await current()) return;
        const [view, profile] = await Promise.all([fetchClashView(clashId), currentViewerProfileId()]);
        if (!view || view.clashId !== clashId || view.status !== 'settled' || !profile) throw Error('Result unavailable');
        if (!await current()) return;
        const { events, complete } = await fetchClashReputationEvents(profile, clashId);
        if (!await current()) return;
        if (!complete) throw Error('Reward history is incomplete');
        const mine = events.filter(event => event.clashId === clashId && event.profileId === profile);
        setRead({ owner, clash: clashId, ballot: view.myBallot,
          reputation: mine.reduce((sum, event) => sum + event.reputationDelta, 0),
          coins: mine.reduce((sum, event) => sum + event.coinsDelta, 0) });
      } catch { if (active) setFailed(scope); }
    })();
    return () => { active = false; };
  }, [owner, clashId, retry, scope]);
  if (!owner) return null;
  const current = read?.owner === owner && read.clash === clashId ? read : null;
  return <View style={{ gap: 8, paddingVertical: 12 }}>
    <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: t.textPrimary }]}>Your recorded result</Text>
    {current ? <>
      <Text style={[typeScale.body, { color: t.textPrimary }]}>{current.ballot ? `Your ballot: Side ${current.ballot}` : 'No ballot recorded for this account.'}</Text>
      <Text style={[typeScale.body, { color: t.textPrimary }]}>{`Reputation: ${current.reputation > 0 ? '+' : ''}${current.reputation}`}</Text>
      <Text style={[typeScale.body, { color: t.textSecondary }]}>{`Coins: ${current.coins > 0 ? '+' : ''}${current.coins}`}</Text>
    </> : failed === scope ? <>
      <Text accessibilityRole="alert" style={[typeScale.body, { color: t.textSecondary }]}>Your ballot and reward history could not be verified. Reward history may be incomplete.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry your recorded result" onPress={() => setRetry(n => n + 1)}
        style={{ minHeight: 48, justifyContent: 'center' }}><Text style={[typeScale.body, { color: t.textPrimary }]}>Retry</Text></Pressable>
    </> : <Text accessibilityLiveRegion="polite" style={[typeScale.body, { color: t.textSecondary }]}>Loading your recorded result…</Text>}
  </View>;
}
