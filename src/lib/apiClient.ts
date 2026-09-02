import type { FirebaseSession } from './firebaseClient';

export const firebaseHeaders = (session: FirebaseSession | null, headers: HeadersInit = {}) => ({
  ...headers,
  ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
});
