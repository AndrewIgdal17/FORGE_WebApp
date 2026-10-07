import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  org: string | null;
  org_type: string | null;
  has_done_tutorial: boolean;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Omit<Profile, 'id' | 'has_done_tutorial'>>,
  ) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.has_done_tutorial === 'boolean';
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !isProfile(data)) return null;
  return {
    id: data.id,
    username: data.username,
    first_name: data.first_name,
    last_name: data.last_name,
    org: data.org,
    org_type: data.org_type,
    has_done_tutorial: data.has_done_tutorial,
  };
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) {
        setProfile(null);
        setLoading(false);
        return;
      }
      void fetchProfile(data.session.user.id).then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setLoading(false);
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const userId = nextSession.user.id;
      // Profile reads need the access token. Defer until this callback
      // returns so the auth client can release its lock.
      setTimeout(() => {
        if (!active) return;
        void fetchProfile(userId).then((nextProfile) => {
          if (!active) return;
          setProfile(nextProfile);
          setLoading(false);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error,
      needsConfirmation: data.session == null,
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Omit<Profile, 'id' | 'has_done_tutorial'>>) => {
      if (!session) {
        return { error: new Error('Not signed in') };
      }
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', session.user.id);
      if (!error) {
        setProfile(await fetchProfile(session.user.id));
      }
      return { error };
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
    }),
    [session, profile, loading, signIn, signUp, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
