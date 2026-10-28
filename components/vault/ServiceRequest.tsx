import { releaseAllows, releaseUnavailableCopy } from '../../utils/releaseScope';
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { requestCreatorService } from '../../services/vaultCommerceService';
import { analytics } from '../../services/analytics';
import { space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export function ServiceRequest({ serviceId }: { serviceId: string }): React.JSX.Element {
  const { user } = useAuth(), router = useRouter(), t = useThemeColors();
  const [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const active = React.useRef(true), pending = React.useRef(false);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const send = async () => {
    if (!user || pending.current || !message.trim()) return;
    pending.current = true; setBusy(true); setNotice('');
    try {
      await requestCreatorService(serviceId, message.trim());
      if (active.current) { analytics.track('vault_service_requested', { realm: 'vault' }); setMessage(''); setNotice('Request sent. No booking or payment was made.'); }
    } catch { if (active.current) setNotice("Couldn't send your request. Your draft is kept; try again."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  if (!releaseAllows('commerce', 'admit')) return <Text style={{ ...typeScale.body, color: t.textSecondary }}>{releaseUnavailableCopy('commerce')}</Text>;
  if (!user) return <VaultActionButton label="Sign in to request" onPress={() => router.push('/auth')} />;
  return <View style={{ gap: space.sm }}>
    <Text style={{ ...typeScale.label, color: t.textPrimary }}>Request a session</Text>
    <TextInput value={message} onChangeText={next => setMessage(next.slice(0, 500))} multiline maxLength={500}
      accessibilityLabel="Note for the creator" accessibilityState={{ disabled: busy }} editable={!busy} placeholder="A short note for the creator" placeholderTextColor={t.textMuted}
      style={{ ...typeScale.body, minHeight: 100, padding: space.md, borderWidth: 1, borderRadius: 12,
        color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground, textAlignVertical: 'top' }} />
    <VaultActionButton label={busy ? 'Sending…' : 'Request session'} busy={busy} disabled={!message.trim()} onPress={() => void send()} />
    {notice ? <Text accessibilityLiveRegion="polite" style={{ ...typeScale.body, color: t.textSecondary }}>{notice}</Text> : null}
  </View>;
}
