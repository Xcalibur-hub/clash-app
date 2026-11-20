import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { typeScale, useThemeColors } from '../../theme';

/** The caller supplies a read-only snapshot callback, never settlement or a vote. */
export function ResultRefresh({ onRefresh }: { onRefresh: () => Promise<void> }): React.JSX.Element {
  const t = useThemeColors();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const inFlight = React.useRef(false), mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = async (): Promise<void> => {
    if (inFlight.current || !mounted.current) return;
    inFlight.current = true; setBusy(true); setFailed(false);
    try { await onRefresh(); } catch { if (mounted.current) setFailed(true); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh official result" disabled={busy}
      accessibilityState={{ disabled: busy, busy }} onPress={() => void refresh()}
      style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={[typeScale.label, { color: t.textPrimary }]}>{busy ? 'Refreshing…' : 'Refresh result'}</Text>
    </Pressable>
    {failed ? <Text accessibilityRole="alert" style={[typeScale.body, { color: t.textSecondary }]}>Result could not be refreshed. Try again.</Text> : null}
  </View>;
}
