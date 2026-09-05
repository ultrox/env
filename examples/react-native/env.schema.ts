import { createEnv, required, number } from '@ma.vu/env';

export default createEnv({
  EXPO_PUBLIC_API_URL: required,
  EXPO_PUBLIC_TIMEOUT: number.min(1),
});
