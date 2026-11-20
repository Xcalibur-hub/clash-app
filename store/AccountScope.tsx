import React from 'react';
import { useAuth } from './AuthProvider';
import { ClashProvider } from './ClashStore';
import { backendAccountKey } from '../utils/supabaseEnv';

/** A new identity gets fresh stores, screens, drafts, permissions and subscriptions.
 * Late async responses retain only the disposed instance's setters.
 */
export function AccountScope({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  return <ClashProvider key={backendAccountKey(user?.id)}>{children}</ClashProvider>;
}
