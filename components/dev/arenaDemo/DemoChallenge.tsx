import React from 'react';
import { Text, View } from 'react-native';
import { ChallengeInvitation } from '../../arena/ChallengeInvitation';
import { ClashConfirmedOverlay } from '../../arena/ClashConfirmedOverlay';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { useThemeColors } from '../../../theme';
import type { ArenaChallenge } from '../../../utils/arenaChallengePayload';
import type { DemoState } from './model';

export function DemoChallenge({ state: s, onAccept, onPass }: { state: DemoState; onAccept: () => void; onPass: () => void }): React.JSX.Element {
  const t = useThemeColors(), [status, setStatus] = React.useState<'PENDING' | 'EXPIRED' | 'ERROR' | 'BUSY' | 'ACCEPTED'>('PENDING');
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const challenger = s.data.authors[1];
  const challenge: ArenaChallenge = { id: 'demo-invitation', takeId: 'demo-take-0', challengedId: s.data.authors[0].id, challengerId: challenger.id, challenger, counterPosition: 'Connection and creativity also happen on screen. Better tools should give people agency, rather than decide what a meaningful life looks like.', status: status === 'EXPIRED' ? 'EXPIRED' : 'PENDING', createdAt: new Date(s.now).toISOString(), expiresAt: new Date(s.now + 3600000).toISOString(), resolvedAt: null, clashId: null, roomId: null, created: false };
  const accept = () => { if (status !== 'PENDING' && status !== 'ERROR') return; setStatus('BUSY'); timer.current = setTimeout(() => { setStatus('ACCEPTED'); timer.current = setTimeout(onAccept, 800); }, 600); };
  return <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }}><ArenaButton label="Demo: pending" variant="tertiary" disabled={status === 'BUSY' || status === 'ACCEPTED'} onPress={() => setStatus('PENDING')} /><ArenaButton label="Expired" variant="tertiary" disabled={status === 'BUSY' || status === 'ACCEPTED'} onPress={() => setStatus('EXPIRED')} /><ArenaButton label="Error" variant="tertiary" disabled={status === 'BUSY' || status === 'ACCEPTED'} onPress={() => setStatus('ERROR')} /></View>
    <Text style={{ color: t.textMuted, paddingHorizontal: 16, fontSize: 11 }}>DEMO · Local delay only. No server request or real acceptance.</Text>
    <ChallengeInvitation challenge={challenge} takeText={s.data.takes[0].take.text} remaining={1} eligible={status !== 'EXPIRED'} busy={status === 'BUSY' || status === 'ACCEPTED'} error={status === 'ERROR' ? 'Simulated connection failure. Retry stays local.' : null} onAccept={accept} onPass={onPass} />
    <ClashConfirmedOverlay visible={status === 'ACCEPTED'} fighterA={s.data.authors[0]} fighterB={challenger} />
  </View>;
}
