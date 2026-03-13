import { createEnv, required, optional, number } from "../src/index.js";

const env = createEnv({
  HOST: required,
  PORT: number,
  API_KEY: optional,
});

env.cli();
