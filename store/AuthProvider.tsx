import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { requestOtp, signInWithPasswordLocal, signOut, verifyOtp } from '../services/authService';
import { isLocalSupabase, supabase } from '../services/supabaseClient';

/**
 * One auth context for the whole app. It owns the session lifecycle — restore on
 * launch, follow `onAuthStateChange`, and expose the email-OTP actions — so no
 * screen duplicates session logic or talks to `supabase.auth` directly.
 */

interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  signedIn: boolean;
  /** True when EXPO_PUBLIC_SUPABASE_URL is the local Docker stack. */
  isLocalSupabase: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  /** LOCAL ONLY — password path for seeded `dev@clash.local`. */
  signInWithPasswordLocal: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore the persisted session on launch, then follow every auth change.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signedIn: Boolean(session?.user),
      isLocalSupabase,
      requestOtp,
      verifyOtp,
      signInWithPasswordLocal,
      signOut,
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
