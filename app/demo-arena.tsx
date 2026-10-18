import React from 'react';
import Constants from 'expo-constants';
import { arenaDemoAllowed } from '../utils/arenaDemoGate';
import Disabled from '../components/dev/arenaDemo/Disabled';

export default function DemoArenaRoute(): React.JSX.Element {
  if (!arenaDemoAllowed(__DEV__, Constants.expoConfig?.extra?.appVariant)) return <Disabled />;
  // Metro also redirects this dependency to Disabled for non-development bundles.
  const Demo = require('../components/dev/arenaDemo/entry').default as React.ComponentType;
  return <Demo />;
}
