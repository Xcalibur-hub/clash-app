/**
 * Crowd shell — thin re-export of LiveCrowdLayer for existing smoke/tests.
 */
import React from 'react';
import { LiveCrowdLayer } from './LiveCrowdLayer';

export function CrowdShell(): React.JSX.Element {
  return <LiveCrowdLayer />;
}
