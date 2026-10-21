import React from 'react';
import { AccessibilityInfo, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useClock } from '../../hooks/useClock';
import { useThemeColors } from '../../theme';
import { challengeCanAct, type ArenaChallenge } from '../../utils/arenaChallengePayload';
import { ArenaButton } from './ui/ArenaPrimitives';
import { ChallengeInvitation } from './ChallengeInvitation';

export interface FullScreenChallengeDeckProps {
  visible: boolean; challenges: readonly ArenaChallenge[]; takeText: string; busy?: boolean; error?: string | null;
  onClose: () => void; onAccept: (challenge: ArenaChallenge) => Promise<void>; onPass: (challenge: ArenaChallenge) => Promise<void>;
}
export function FullScreenChallengeDeck({ visible, challenges, takeText, busy = false, error, onClose, onAccept, onPass }: FullScreenChallengeDeckProps): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), reduced = useReducedMotion(), now = useClock(1000);
  const completed = React.useRef(new Set<string>());
  const working = React.useRef(false), alive = React.useRef(true);
  const [submitting, setSubmitting] = React.useState(false), [failure, setFailure] = React.useState<string | null>(null);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = challenges[0] ?? null, eligible = !!current && challengeCanAct(current, now), locked = busy || submitting || (!!current && completed.current.has(current.id));
  React.useEffect(() => { setFailure(null); }, [current?.id]);
  const commit = async (decision: 'accept' | 'pass'): Promise<void> => {
    if (!current || working.current || busy || completed.current.has(current.id)) return;
    // Local veto removes stale actions; RPC and the connected parent remain authoritative.
    if (!challengeCanAct(current)) { setFailure('This challenge has expired. Close to refresh its history.'); return; }
    working.current = true; setSubmitting(true); setFailure(null);
    AccessibilityInfo.announceForAccessibility(decision === 'accept' ? 'Accepting challenge' : 'Passing on challenge');
    try { await (decision === 'accept' ? onAccept(current) : onPass(current)); completed.current.add(current.id); }
    catch { if (alive.current) setFailure('Could not confirm this decision. No success has been assumed. Check the status and retry.'); }
    finally { working.current = false; if (alive.current) setSubmitting(false); }
  };
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        if (!locked) onClose();
      }}
    >
      <View
        accessibilityViewIsModal
        accessibilityLabel="Full screen challenge deck"
        style={{
          flex: 1,
          backgroundColor: t.background,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <View style={{ paddingHorizontal: 12, alignItems: 'flex-start' }}>
          <ArenaButton
            label="Close"
            accessibilityLabel="Close challenges"
            variant="tertiary"
            disabled={locked}
            onPress={onClose}
          />
        </View>
        <ChallengeInvitation
          challenge={current}
          takeText={takeText}
          remaining={challenges.length}
          busy={locked}
          eligible={eligible}
          error={error || failure}
          onAccept={() => void commit('accept')}
          onPass={() => void commit('pass')}
        />
      </View>
    </Modal>
  );
}
