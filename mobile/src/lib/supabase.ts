import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const secureStoreAdapter = {
  async getItem(key: string) {
    if (!(await SecureStore.isAvailableAsync())) {
      return null;
    }

    return SecureStore.getItemAsync(key);
  },
  async removeItem(key: string) {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(key);
    }
  },
  async setItem(key: string, value: string) {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(key, value);
    }
  },
};

function createSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const url = new URL(supabaseUrl);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureStoreAdapter,
      },
    });
  } catch {
    return null;
  }
}

export const supabase = createSupabaseClient();
