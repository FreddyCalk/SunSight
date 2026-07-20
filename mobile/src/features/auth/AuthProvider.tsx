import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { deriveAuthGate, type AuthGate } from '@/features/auth/gate';
import { normalizeUsCanadaE164 } from '@/features/auth/phone';
import { CAPTCHA_SITE_KEY } from '@/lib/config';
import { queryClient as appQueryClient } from '@/lib/query-client';
import { requireSupabase, supabase } from '@/lib/supabase';
import { profileKeys, profileQueryOptions } from '@/queries/profile';

type AuthContextValue = {
  gate: AuthGate;
  session: Session | null;
  sendOtp: (phoneInput: string, captchaToken?: string) => Promise<{ phone: string }>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    ...profileQueryOptions(userId ?? ''),
    enabled: Boolean(supabase && userId),
  });

  const gate = useMemo(
    () =>
      deriveAuthGate({
        clientReady: Boolean(supabase),
        session,
        sessionLoading,
        profile: profileQuery.data,
        profileLoading: profileQuery.isLoading || profileQuery.isFetching,
        profileError: profileQuery.isError,
      }),
    [
      session,
      sessionLoading,
      profileQuery.data,
      profileQuery.isLoading,
      profileQuery.isFetching,
      profileQuery.isError,
    ],
  );

  const sendOtp = useCallback(async (phoneInput: string, captchaToken?: string) => {
    const phone = normalizeUsCanadaE164(phoneInput);
    if (!phone) {
      throw new Error('Enter a valid US or Canada mobile number.');
    }

    const client = requireSupabase();
    const token = captchaToken?.trim() || undefined;

    if (CAPTCHA_SITE_KEY && !token) {
      throw new Error('Complete the CAPTCHA challenge before requesting a code.');
    }

    const { error } = await client.auth.signInWithOtp({
      phone,
      options: token ? { captchaToken: token } : undefined,
    });

    if (error) {
      throw new Error(error.message || 'Could not send a verification code.');
    }

    return { phone };
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const normalizedPhone = normalizeUsCanadaE164(phone);
    if (!normalizedPhone) {
      throw new Error('Enter a valid US or Canada mobile number.');
    }

    const code = token.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Enter the 6-digit code from the text message.');
    }

    const client = requireSupabase();
    const { data, error } = await client.auth.verifyOtp({
      phone: normalizedPhone,
      token: code,
      type: 'sms',
    });

    if (error) {
      throw new Error(error.message || 'That code could not be verified.');
    }

    if (!data.session || !data.user?.phone_confirmed_at) {
      throw new Error('Phone verification did not complete. Try again.');
    }

    setSession(data.session);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    appQueryClient.clear();
    queryClient.clear();
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: profileKeys.byUser(userId) });
  }, [queryClient, userId]);

  const value = useMemo(
    () => ({
      gate,
      session,
      sendOtp,
      verifyOtp,
      signOut,
      refreshProfile,
    }),
    [gate, session, sendOtp, verifyOtp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
