export {
  StringDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
  required,
  optional,
  number,
  boolean,
} from "./descriptors.js";
export type { Descriptor } from "./descriptors.js";
export type { EnvSchema, InferEnv } from "./parse.js";

import type { Descriptor } from "./descriptors.js";
import { parse, type EnvSchema, type InferEnv } from "./parse.js";

export interface Env<S extends EnvSchema> {
  parse(
    source: Record<string, string | undefined>,
  ): { data: InferEnv<S>; warnings: string[] };
  keys: readonly (keyof S & string)[];
}

export function createEnv<const S extends Record<string, Descriptor>>(
  schema: S,
): Env<S> {
  const schemaSnapshot = { ...schema };
  const keys = Object.freeze(Object.keys(schemaSnapshot) as (keyof S & string)[]);
  for (const key of keys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment variable name: ${JSON.stringify(key)}`);
    }
  }

  return {
    parse(source) {
      return parse(schemaSnapshot, source);
    },
    keys,
  };
}
