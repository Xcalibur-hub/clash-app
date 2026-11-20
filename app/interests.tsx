import React from 'react';
import { useRouter } from 'expo-router';
import { ArenaInterestEditor } from '../components/onboarding/ArenaInterestEditor';
import { OnboardingNextStep, type OnboardingDestination } from '../components/onboarding/OnboardingNextStep';
import { useAuth } from '../store/AuthProvider';
import { useOperationScope } from '../hooks/useOperationScope';
import { useIsFocused } from '@react-navigation/native';
export default function InterestsScreen(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth(), isCurrent = useOperationScope(user?.id ?? 'guest');
  const focused = useIsFocused(), isCurrentVisit = useOperationScope(`${user?.id ?? 'guest'}:${focused}`);
  const [completed, setCompleted] = React.useState<{ scope: () => boolean } | null>(null);
  const back = (): void => { if (!isCurrent() || !focused || !isCurrentVisit()) return; if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const finish = (destination?: OnboardingDestination): void => { if (!isCurrent() || !focused || !isCurrentVisit()) return; if (destination) router.replace(destination); else back(); };
  return completed?.scope === isCurrent ? <OnboardingNextStep onDone={finish} /> :
    <ArenaInterestEditor key={user?.id ?? 'guest'} onSaved={(_prefs, wasIncomplete) => {
      if (!isCurrent()) return;
      if (wasIncomplete) setCompleted({ scope: isCurrent }); else back();
    }} onBack={back} />;
}
