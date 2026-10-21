import React from 'react';
import { Text, View } from 'react-native';
import { ChallengeInvitation } from '../../arena/ChallengeInvitation';
import { ClashConfirmedOverlay } from '../../arena/ClashConfirmedOverlay';
import { ArenaButton } from '../../arena/ui/ArenaPrimitives';
import { useThemeColors } from '../../../theme';
import type { ArenaChallenge, ChallengeStatus } from '../../../utils/arenaChallengePayload';
import type { DemoState } from './model';

type DemoInviteStatus = 'PENDING' | 'EXPIRED' | 'PASSED' | 'CANCELLED' | 'ERROR' | 'BUSY' | 'ACCEPTED';

/** Local-only invitation states for Phase 6 acceptance — never hits the server. */
export function DemoChallenge({
  state: s,
  onAccept,
  onPass,
}: {
  state: DemoState;
  onAccept: () => void;
  onPass: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const [status, setStatus] = React.useState<DemoInviteStatus>('PENDING');
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const challenger = s.data.authors[1];
  const locked = status === 'BUSY' || status === 'ACCEPTED';

  const challengeStatus = ((): ChallengeStatus => {
    if (status === 'EXPIRED') return 'EXPIRED';
    if (status === 'PASSED') return 'PASSED';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'ACCEPTED' || status === 'BUSY') return status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING';
    return 'PENDING';
  })();

  const resolved =
    challengeStatus === 'PENDING' || challengeStatus === 'EXPIRED'
      ? null
      : new Date(s.now + 60_000).toISOString();

  const createdAt = new Date(s.now - 7_200_000).toISOString();
  const expiresAt = new Date(
    status === 'EXPIRED' ? s.now - 3_600_000 : s.now + 3_600_000,
  ).toISOString();
  const challenge: ArenaChallenge = {
    id: 'demo-invitation',
    takeId: 'demo-take-0',
    challengedId: s.data.authors[0].id,
    challengerId: challenger.id,
    challenger,
    counterPosition:
      'Connection and creativity also happen on screen. Better tools should give people agency, rather than decide what a meaningful life looks like.',
    status: challengeStatus,
    createdAt,
    expiresAt,
    resolvedAt: resolved,
    clashId: challengeStatus === 'ACCEPTED' ? 'demo-clash' : null,
    roomId: challengeStatus === 'ACCEPTED' ? 'demo-room' : null,
    created: false,
  };

  const accept = (): void => {
    if (status !== 'PENDING' && status !== 'ERROR') return;
    setStatus('BUSY');
    timer.current = setTimeout(() => {
      setStatus('ACCEPTED');
      // Hold confirmation overlay long enough for A50 visual acceptance.
      timer.current = setTimeout(onAccept, 1600);
    }, 600);
  };

  const actionable =
    status === 'PENDING' || status === 'ERROR' || status === 'BUSY';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 4 }}>
        {(
          [
            ['Demo: pending', 'PENDING'],
            ['Declined', 'PASSED'],
            ['Cancelled', 'CANCELLED'],
            ['Expired', 'EXPIRED'],
            ['Error', 'ERROR'],
          ] as const
        ).map(([label, next]) => (
          <ArenaButton
            key={next}
            label={label}
            variant="tertiary"
            disabled={locked}
            selected={status === next}
            onPress={() => setStatus(next)}
          />
        ))}
      </View>
      <Text style={{ color: t.textMuted, paddingHorizontal: 16, fontSize: 11 }}>
        DEMO · Local delay only. No server request or real acceptance.
      </Text>
      <ChallengeInvitation
        challenge={challenge}
        takeText={s.data.takes[0].take.text}
        remaining={1}
        eligible={actionable}
        busy={status === 'BUSY' || status === 'ACCEPTED'}
        error={
          status === 'ERROR' ? 'Simulated connection failure. Retry stays local.' : null
        }
        onAccept={accept}
        onPass={onPass}
      />
      <ClashConfirmedOverlay
        visible={status === 'ACCEPTED'}
        fighterA={s.data.authors[0]}
        fighterB={challenger}
      />
    </View>
  );
}
