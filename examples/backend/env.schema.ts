import { createEnv, required, number, boolean } from '@ma.vu/env';

export default createEnv({
  DATABASE_URL: required,
  PORT: number.min(1).max(65535),
  DEBUG: boolean,
});
