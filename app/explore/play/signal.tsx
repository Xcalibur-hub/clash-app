import React from 'react';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { useAuth } from '../../../store/AuthProvider';
import { ReleaseUnavailable } from '../../../components/shared/ReleaseUnavailable';
import { SignalGame } from '../../../components/play/signal/SignalGame';

export default function SignalRoute(): React.JSX.Element {
  const router = useRouter(), { user } = useAuth();
  if (!arenaDemoAllowed(typeof __DEV__ !== 'undefined' && __DEV__, Constants.expoConfig?.extra?.appVariant)) return <ReleaseUnavailable capability="play" />;
  return <SignalGame key={user?.id ?? 'guest'} onExit={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />;
}
