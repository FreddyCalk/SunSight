import * as Location from 'expo-location';
import { z } from 'zod';

import { getLocationPermissionState } from '@/features/permissions/location';
import { invokeEdgeFunction } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';

const upsertLocationResponseSchema = z.object({
  capturedAt: z.string(),
  expiresAt: z.string(),
  accuracyM: z.number(),
});

/**
 * Capture a coarse foreground location and upsert it when permission is already granted.
 * Does not prompt and never requests background location.
 */
export async function upsertForegroundLocationIfAllowed(
  client: SunsightClient,
): Promise<z.infer<typeof upsertLocationResponseSchema> | null> {
  const permission = await getLocationPermissionState();
  if (permission !== 'granted') {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const accuracyM = position.coords.accuracy;
  if (accuracyM == null || !(accuracyM > 0)) {
    return null;
  }

  return invokeEdgeFunction(
    client,
    'upsert-location',
    {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      accuracyM,
      capturedAt: new Date(position.timestamp).toISOString(),
      source: 'foreground',
    },
    upsertLocationResponseSchema,
  );
}
