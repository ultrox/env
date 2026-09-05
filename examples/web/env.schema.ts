import { createEnv, required, number } from '@ma.vu/env';

export default createEnv({
  VITE_API_URL: required,
  VITE_TIMEOUT: number.min(1),
});
