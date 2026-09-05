import { writeFileSync } from "node:fs";
import type { EnvSchema, InferEnv } from "./parse.js";

export interface WriteEnvFileOptions {
  source: string | Record<string, string | undefined>;
  output: string;
  format?: "dotenv" | "shell";
}

interface WriteEnvFileContext<S extends EnvSchema> {
  keys: readonly string[];
  parse(
    source: Record<string, string | undefined>,
  ): { data: InferEnv<S>; warnings: string[] };
}

export function writeEnvFile<S extends EnvSchema>(
  ctx: WriteEnvFileContext<S>,
  options: WriteEnvFileOptions,
): void {
  const format = options.format ?? "dotenv";
  if (format !== "dotenv" && format !== "shell") {
    throw new Error('writeEnvFile: format must be "dotenv" or "shell"');
  }

  let source: unknown = options.source;
  if (typeof options.source === "string") {
    try {
      source = JSON.parse(options.source);
    } catch {
      throw new Error("writeEnvFile: source is not valid JSON");
    }
  }
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new Error("writeEnvFile: source must be a JSON object");
  }
  const { data } = ctx.parse(source as Record<string, string | undefined>);

  const lines = ctx.keys
    .filter((key) => {
      const v = (data as Record<string, unknown>)[key];
      return v !== undefined && v !== "";
    })
    .map((key) => {
      const value = String((data as Record<string, unknown>)[key]);
      if (format === "shell") {
        return `export ${key}='${value.replaceAll("'", "'\\''")}'`;
      }
      return `${key}=${quoteDotenv(key, value)}`;
    });

  writeFileSync(options.output, lines.join("\n") + "\n", { mode: 0o600 });
}

function quoteDotenv(key: string, value: string): string {
  if (/^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) return value;

  // Single quotes preserve literal dollars, backslashes, and double quotes.
  if (!/['\r\n]/.test(value)) return `'${value}'`;

  // Node and direnv both expand LF escapes in double quotes.
  // Other escapes and interpolation differ between dotenv readers.
  if (!/["\\$`\r]/.test(value)) {
    return `"${value.replaceAll("\n", "\\n")}"`;
  }

  throw new Error(
    `${key}: cannot be represented portably in dotenv format; use format: "shell" or supply the environment directly`,
  );
}
