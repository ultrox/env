import schema from './env.schema.ts';

// Expo needs these literal property accesses to inline values during bundling.
export const { data: env } = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_TIMEOUT: process.env.EXPO_PUBLIC_TIMEOUT,
});
