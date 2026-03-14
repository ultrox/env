import { writeFileSync } from "node:fs";
import type { EnvSchema, InferEnv } from "./parse.js";

interface WriteEnvFileOptions {
  source: Record<string, string | undefined>;
  output: string;
}

interface WriteEnvFileContext<S extends EnvSchema> {
  keys: string[];
  parse(
    source: Record<string, string | undefined>,
  ): { data: InferEnv<S>; warnings: string[] };
}

export function writeEnvFile<S extends EnvSchema>(
  ctx: WriteEnvFileContext<S>,
  options: WriteEnvFileOptions,
): void {
  const { data } = ctx.parse(options.source);

  const lines = ctx.keys
    .filter((key) => {
      const v = (data as Record<string, unknown>)[key];
      return v !== undefined && v !== "";
    })
    .map((key) => `${key}=${(data as Record<string, unknown>)[key]}`);

  writeFileSync(options.output, lines.join("\n") + "\n");
}
