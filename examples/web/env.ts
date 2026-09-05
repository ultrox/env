import schema from './env.schema.ts';

export const { data: env } = schema.parse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_TIMEOUT: import.meta.env.VITE_TIMEOUT,
});
