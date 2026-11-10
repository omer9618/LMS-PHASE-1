'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api/client';
import { isApiError } from './api/errors';
import type { Me } from './api/types';
import * as authSchema from './api/schemas/auth';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

export interface Session {
  status: SessionStatus;
  user: Me | null;
  /** Re-reads GET /auth/me: call after anything that starts, ends or changes the session. */
  refresh(): Promise<Me | null>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * The signed-in user, or null. Signed out, an expired session and an unreachable API all read as
 * null: the header then shows "Sign in" rather than blocking the page.
 */
async function fetchMe(): Promise<Me | null> {
  try {
    return await api.get('/auth/me', authSchema.me);
  } catch (error) {
    if (!isApiError(error, 'UNAUTHENTICATED')) console.warn('Could not load the session', error);
    return null;
  }
}

/**
 * Who is signed in, for the whole app. The session itself is the API's HTTP-only cookie; this only
 * mirrors GET /auth/me so the UI can show the user.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const apply = useCallback((me: Me | null) => {
    setUser(me);
    setStatus(me ? 'signed-in' : 'signed-out');
    return me;
  }, []);

  const refresh = useCallback(() => fetchMe().then(apply), [apply]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setStatus('signed-out');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (active) apply(me);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const value = useMemo(
    () => ({ status, user, refresh, signOut }),
    [status, user, refresh, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

/** "Ayesha Khan", or the email when no name is set. */
export function displayName(user: Pick<Me, 'fullName' | 'email'>): string {
  return user.fullName?.trim() || user.email;
}

/** An admin must enrol in MFA before anything but MFA set-up works (#16). */
export function needsMfaSetup(user: Pick<Me, 'roles' | 'mfaEnabled'> | null): boolean {
  return Boolean(user && user.roles.includes('ADMIN') && !user.mfaEnabled);
}
