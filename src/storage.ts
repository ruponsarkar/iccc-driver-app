import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Session } from './models';
const prefix = process.env.EXPO_PUBLIC_USE_MOCK_API === 'true' ? 'iccc.demo.' : 'iccc.live.';
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = Platform.OS === 'web' ? sessionStorage.getItem(prefix + key) : await SecureStore.getItemAsync(prefix + key);
    return raw ? JSON.parse(raw) as T : null;
  },
  async set(key: string, value: unknown) {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') sessionStorage.setItem(prefix + key, raw);
    else await SecureStore.setItemAsync(prefix + key, raw);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') sessionStorage.removeItem(prefix + key);
    else await SecureStore.deleteItemAsync(prefix + key);
  },
};
export const sessionStore = {
  get: () => storage.get<Session>('session'),
  save: (value: Session) => storage.set('session', value),
  clear: () => storage.remove('session'),
};
