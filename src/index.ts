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
import { parse, type EnvSchema, type ParseResult } from "./parse.js";
import { cli as runCli } from "./cli.js";

interface Env<S extends EnvSchema> {
  parse(source: Record<string, string | undefined>): ParseResult<S>;
  cli(): void;
  keys: (keyof S & string)[];
}

export function createEnv<const S extends Record<string, Descriptor>>(
  schema: S,
): Env<S> {
  const keys = Object.keys(schema) as (keyof S & string)[];

  return {
    parse(source) {
      return parse(schema, source);
    },
    cli() {
      runCli({ keys, parse: (source) => parse(schema, source) });
    },
    keys,
  };
}
