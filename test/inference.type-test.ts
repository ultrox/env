import { createEnv, required, optional, number, boolean, type InferEnv } from "../src/index.js";

const schema = {
  API_KEY: required,
  LABEL: optional,
  PORT: number.min(1).max(65535),
  DEBUG: boolean,
};
const definition = createEnv(schema);
const { data: env } = definition.parse({ API_KEY: "secret", PORT: "3000" });

const expected: { API_KEY: string; LABEL: string; PORT: number; DEBUG: boolean } = env;
const inferred: InferEnv<typeof schema> = expected;
void inferred;

// @ts-expect-error Undeclared variables must not be available to application code.
env.UNDECLARED;
// @ts-expect-error Numeric variables must not remain strings.
env.PORT.toUpperCase();
// @ts-expect-error Boolean variables must not be assignable to strings.
const debug: string = env.DEBUG;
// @ts-expect-error The schema's key list is readonly.
definition.keys.push("API_KEY");
void debug;
