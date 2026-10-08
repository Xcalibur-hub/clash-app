import React from 'react';
import { useRouter } from 'expo-router';
import { ArenaInterestEditor } from '../components/onboarding/ArenaInterestEditor';
export default function InterestsScreen(): React.JSX.Element {
  const router = useRouter();
  const back = (): void => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  return <ArenaInterestEditor onSaved={back} onBack={back} />;
}
