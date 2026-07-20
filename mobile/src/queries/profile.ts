import { queryOptions } from '@tanstack/react-query';

import { requireSupabase } from '@/lib/supabase';

export type ProfileRow = {
  id: string;
  display_name: string | null;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  privacy_policy_version: string | null;
  privacy_policy_accepted_at: string | null;
};

export const profileKeys = {
  all: ['profiles'] as const,
  byUser: (userId: string) => [...profileKeys.all, 'user', userId] as const,
};

export const profileQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: profileKeys.byUser(userId),
    queryFn: async (): Promise<ProfileRow | null> => {
      const client = requireSupabase();
      const { data, error } = await client
        .from('profiles')
        .select(
          'id, display_name, status, privacy_policy_version, privacy_policy_accepted_at',
        )
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    staleTime: 30_000,
  });
