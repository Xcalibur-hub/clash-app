import React from 'react';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { DemoArena } from './DemoArena';
import Disabled from './Disabled';
import type { Page } from './model';

export default function DemoEntry(): React.JSX.Element {
  const router = useRouter(), params = useLocalSearchParams<{ demoScreen?: string }>();
  if (!arenaDemoAllowed(__DEV__, Constants.expoConfig?.extra?.appVariant)) return <Disabled />;
  const kinds = ['home', 'live', 'groups', 'discover', 'take', 'room'] as const;
  const kind = kinds.find(value => value === params.demoScreen) ?? 'home';
  const page: Page = { kind, ...(['take', 'room'].includes(kind) ? { id: 'demo-take-0' } : {}) };
  return <DemoArena initialPage={page} onExit={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }} />;
}
