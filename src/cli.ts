import { readFileSync, writeFileSync } from "node:fs";
import type { EnvSchema, InferEnv } from "./parse.js";

type Mode =
  | { kind: "validate"; path: string }
  | { kind: "write"; path: string };

function parseArgs(): Mode {
  const [, , first, second] = process.argv;
  if (first === "--write" && second) return { kind: "write", path: second };
  if (first && first !== "--write") return { kind: "validate", path: first };

  console.error(
    "Usage:\n  validate-env <path-to-.env>\n  validate-env --write <output-path>",
  );
  process.exit(1);
}

function readDotEnv(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf-8")
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith("#"))
      .flatMap((line: string) => {
        const eq = line.indexOf("=");
        return eq !== -1 ? [[line.slice(0, eq), line.slice(eq + 1)]] : [];
      }),
  );
}

function readSecretsJson(keys: string[]): Record<string, string> {
  const raw = process.env.SECRETS_JSON;
  if (!raw) {
    console.error("[env] SECRETS_JSON env var not set");
    process.exit(1);
  }
  try {
    const secrets = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      keys.flatMap((key) => (secrets[key] ? [[key, secrets[key]]] : [])),
    );
  } catch {
    console.error("[env] SECRETS_JSON is not valid JSON");
    process.exit(1);
  }
}

interface CliContext<S extends EnvSchema> {
  keys: string[];
  parse(
    source: Record<string, string | undefined>,
  ): { data: InferEnv<S>; warnings: string[] };
}

export function cli<S extends EnvSchema>(ctx: CliContext<S>): void {
  const mode = parseArgs();

  const source =
    mode.kind === "write"
      ? readSecretsJson(ctx.keys)
      : readDotEnv(mode.path);

  let data: InferEnv<S>;
  let warnings: string[];

  try {
    ({ data, warnings } = ctx.parse(source));
  } catch (err) {
    console.error(`[env] ${(err as Error).message}`);
    process.exit(1);
  }

  if (mode.kind === "write") {
    const lines = ctx.keys
      .filter((key) => {
        const v = (data as Record<string, unknown>)[key];
        return v !== undefined && v !== "";
      })
      .map((key) => `${key}=${(data as Record<string, unknown>)[key]}`);
    writeFileSync(mode.path, lines.join("\n") + "\n");
    console.log(`[env] Wrote ${mode.path}`);
  }

  if (warnings.length) {
    console.warn(`[env] Missing optional: ${warnings.join(", ")}`);
  }

  console.log("[env] OK");
}
