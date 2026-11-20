import React from 'react';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { arenaDemoAllowed } from '../utils/arenaDemoGate';
import Disabled from '../components/dev/arenaDemo/Disabled';
import {
  normalizePreviewStage,
  type PreviewStage,
} from '../components/dev/devArenaPreviewFixture';

/** Development-only preview route for real DuelRoomExperience verification. */
export default function DevArenaPreviewRoute(): React.JSX.Element {
  const router = useRouter();
  const { stage } = useLocalSearchParams<{ stage?: string }>();
  if (!arenaDemoAllowed(__DEV__, Constants.expoConfig?.extra?.appVariant)) {
    return <Disabled />;
  }
  const Preview = require('../components/dev/DevActiveArenaPreview')
    .default as React.ComponentType<{
      initialStage: PreviewStage;
      onExit: () => void;
    }>;
  return (
    <Preview
      initialStage={normalizePreviewStage(stage)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}
