import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerDeviceIfAllowed } from '@/features/devices/register-device';
import { upsertForegroundLocationIfAllowed } from '@/features/location/upsert-location';
import { requireSupabase, supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';

/**
 * On auth-ready and each AppState active transition, refresh push token and
 * foreground location when those permissions are already granted.
 */
export function useAppLifecycleSync(): void {
  const { gate } = useAuth();
  const inFlight = useRef(false);

  useEffect(() => {
    if (gate.status !== 'ready' || !supabase) {
      return;
    }

    const sync = async () => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      try {
        const client = requireSupabase();
        await Promise.allSettled([
          registerDeviceIfAllowed(client),
          upsertForegroundLocationIfAllowed(client),
        ]);
      } finally {
        inFlight.current = false;
      }
    };

    void sync();

    const onChange = (status: AppStateStatus) => {
      if (status === 'active') {
        void sync();
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [gate.status]);
}
