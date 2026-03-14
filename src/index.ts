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
import { writeEnvFile as writeEnvFileImpl } from "./cli.js";

export interface Env<S extends EnvSchema> {
  parse(
    source: Record<string, string | undefined>,
  ): { data: InferEnv<S>; warnings: string[] };
  writeEnvFile(options: { source: string | Record<string, string | undefined>; output: string }): void;
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
    writeEnvFile(options) {
      writeEnvFileImpl({ keys, parse: (source) => parse(schema, source) }, options);
    },
    keys,
  };
}
