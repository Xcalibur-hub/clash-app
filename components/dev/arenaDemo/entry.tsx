import React from 'react';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../../../utils/arenaDemoGate';
import { DemoArena } from './DemoArena';
import Disabled from './Disabled';
import type { Page } from './model';
import { CreatorEventDemo } from '../creatorEventDemo/CreatorEventDemo';

/** Explicit local demo switch; the native variant and development JS gate still apply. */
const CREATOR_EVENT_DEMO_ENABLED = true;

export default function DemoEntry(): React.JSX.Element {
  const router = useRouter(), params = useLocalSearchParams<{ demoScreen?: string }>();
  if (!arenaDemoAllowed(__DEV__, Constants.expoConfig?.extra?.appVariant)) return <Disabled />;
  const exit = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  if (params.demoScreen === 'creator-event') return CREATOR_EVENT_DEMO_ENABLED ? <CreatorEventDemo onExit={exit} /> : <Disabled />;
  const kinds = ['home', 'challenge', 'live', 'groups', 'discover', 'take', 'room'] as const;
  const kind = kinds.find(value => value === params.demoScreen) ?? 'home';
  const page: Page = { kind, ...(['take', 'room'].includes(kind) ? { id: 'demo-take-0' } : {}) };
  return <DemoArena initialPage={page} onExit={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }} />;
}
