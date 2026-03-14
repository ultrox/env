import { writeFileSync } from "node:fs";
import type { EnvSchema, InferEnv } from "./parse.js";

interface WriteEnvFileOptions {
  source: string | Record<string, string | undefined>;
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
  let source: Record<string, string | undefined>;
  if (typeof options.source === "string") {
    try {
      source = JSON.parse(options.source);
    } catch {
      throw new Error(
        `writeEnvFile: source is not valid JSON.\nReceived: ${options.source.slice(0, 100)}${options.source.length > 100 ? "..." : ""}`,
      );
    }
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      throw new Error(
        `writeEnvFile: source must be a JSON object, got ${Array.isArray(source) ? "array" : typeof source}`,
      );
    }
  } else {
    source = options.source;
  }
  const { data } = ctx.parse(source);

  const lines = ctx.keys
    .filter((key) => {
      const v = (data as Record<string, unknown>)[key];
      return v !== undefined && v !== "";
    })
    .map((key) => `${key}=${(data as Record<string, unknown>)[key]}`);

  writeFileSync(options.output, lines.join("\n") + "\n");
}
