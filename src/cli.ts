#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { EnvValidationError, type Env, type EnvSchema } from "./index.js";

const help = `Usage:
  mavu-env check --schema <path[#export]> [--schema <path> ...]
  mavu-env export --schema <path[#export]> --format docker-env --output <path>

Options:
  --schema       Schema module, repeat for multiple applications.
                 Uses the default export or a single named schema export.
  --source-env   Read a JSON string-valued object from this environment variable.
                 Without this option, validate process.env. Never loads .env files.
  --format       Export format: docker-env (for docker run --env-file).
  --output       Destination file; replaced only after all validation succeeds.
  --help         Show this help.

Requires Node 22.18+, 23.6+, or 24+. TypeScript schemas use native type stripping.
Validation failures exit 1; usage errors exit 2. Values are never printed.
`;

class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

type SchemaOptions = { schemas: string[]; sourceEnv: string | undefined };
type Options =
  | { command: "help" }
  | (SchemaOptions & { command: "check" })
  | (SchemaOptions & { command: "export"; output: string });

function parseOptions(args: string[]): Options {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        schema: { type: "string", multiple: true },
        "source-env": { type: "string" },
        format: { type: "string" },
        output: { type: "string" },
        help: { type: "boolean" },
      },
    });
  } catch {
    throw new CliError("Invalid arguments. Run mavu-env --help for usage.", 2);
  }
  const { values, positionals } = parsed;
  if (values.help) return { command: "help" };
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== "check" && command !== "export")) {
    throw new CliError("Expected check or export. Run mavu-env --help for usage.", 2);
  }
  if (!values.schema?.length || values.schema.some((path) => !path.trim())) {
    throw new CliError("At least one --schema is required.", 2);
  }
  const sourceEnv = values["source-env"];
  if (sourceEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sourceEnv)) {
    throw new CliError("--source-env must name an environment variable.", 2);
  }
  if (command === "check") {
    if (values.format !== undefined || values.output !== undefined) {
      throw new CliError("--format and --output belong to the export command.", 2);
    }
    return { command, schemas: values.schema, sourceEnv };
  }
  if (values.format !== "docker-env" || !values.output?.trim()) {
    throw new CliError("export requires --format docker-env and --output <path>.", 2);
  }
  return { command, schemas: values.schema, sourceEnv, output: values.output };
}

function readSource(name: string | undefined): Record<string, string | undefined> {
  if (name === undefined) return { ...process.env };
  const input = process.env[name];
  if (input === undefined) throw new CliError(`Source variable ${name} is not set.`);
  let source: unknown;
  try {
    source = JSON.parse(input);
  } catch {
    throw new CliError(`Source variable ${name} must contain valid JSON.`);
  }
  if (
    typeof source !== "object" || source === null || Array.isArray(source) ||
    !Object.values(source).every((value) => typeof value === "string")
  ) {
    throw new CliError(`Source variable ${name} must contain a JSON object with string values.`);
  }
  return source as Record<string, string>;
}

function isSchema(value: unknown): value is Env<EnvSchema> {
  return (
    typeof value === "object" && value !== null &&
    "parse" in value && typeof value.parse === "function" &&
    "keys" in value && Array.isArray(value.keys) &&
    value.keys.every((key: unknown) => typeof key === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
  );
}

async function loadSchema(specifier: string): Promise<Env<EnvSchema>> {
  const separator = specifier.lastIndexOf("#");
  let path = specifier;
  let exportName: string | undefined;
  if (separator >= 0) {
    // Prefer an existing literal filename, which may itself contain '#'.
    const literalFile = await stat(resolve(specifier)).then((entry) => entry.isFile(), () => false);
    if (!literalFile) {
      path = specifier.slice(0, separator);
      exportName = specifier.slice(separator + 1);
    }
  }
  let module: Record<string, unknown>;
  try {
    module = await import(pathToFileURL(resolve(path)).href);
  } catch {
    // Import exceptions may include source excerpts or secret values.
    throw new CliError("Cannot load schema. Check its path, imports and Node-compatible syntax; keep environment reads out of the schema module.");
  }
  if (exportName !== undefined) {
    const selected = module[exportName];
    if (!Object.hasOwn(module, exportName) || !isSchema(selected)) {
      throw new CliError("Selected export must be a createEnv() schema.");
    }
    return selected;
  }
  if (isSchema(module.default)) return module.default;
  const candidates = [...new Set(Object.values(module).filter(isSchema))];
  if (candidates.length !== 1) {
    throw new CliError("Export a default schema or one named schema; use --schema path#export to select among multiple schemas.");
  }
  return candidates[0]!;
}

type EnvValue = string | number | boolean;
type Validated = { keys: readonly string[]; data: Record<string, EnvValue> };

async function validate(schemas: string[], source: Record<string, string | undefined>): Promise<Validated[]> {
  const results: Validated[] = [];
  const errors: string[] = [];
  for (const [index, specifier] of schemas.entries()) {
    try {
      const schema = await loadSchema(specifier);
      const { data } = schema.parse({ ...source });
      results.push({ keys: schema.keys, data });
    } catch (error) {
      const message = error instanceof EnvValidationError || error instanceof CliError
        ? error.message : "Schema validation failed (unexpected error details withheld).";
      errors.push(`Schema ${index + 1}: ${message}`);
    }
  }
  if (errors.length) throw new CliError(errors.join("\n"));
  return results;
}

function isSerializable(value: unknown): value is EnvValue {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function dockerEnv(results: Validated[]): string {
  const merged = new Map<string, EnvValue>();
  for (const { keys, data } of results) {
    for (const key of keys) {
      const value = data[key];
      if (!Object.hasOwn(data, key) || !isSerializable(value)) {
        throw new CliError(`${key}: schema did not return a serializable value.`);
      }
      if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new CliError(`${key}: unsafe integer cannot be exported; use a string schema for exact IDs or large integers.`);
      }
      if (merged.has(key) && !Object.is(merged.get(key), value)) {
        throw new CliError(`${key}: schemas produce conflicting values; export separate files for these applications.`);
      }
      merged.set(key, value);
    }
  }
  const lines: string[] = [];
  for (const [key, value] of merged) {
    const line = `${key}=${value}`;
    if (/[\r\n\0]/.test(line) || Buffer.from(line, "utf8").toString("utf8") !== line) {
      throw new CliError(`${key}: value cannot be represented in docker-env (requires single-line UTF-8 without null bytes).`);
    }
    if (Buffer.byteLength(line, "utf8") + 1 >= 65536) {
      throw new CliError(`${key}: docker-env line must be smaller than 64 KiB.`);
    }
    lines.push(line);
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

async function writeOutput(output: string, content: string): Promise<void> {
  const destination = resolve(output);
  const temporary = join(dirname(destination), `.mavu-env-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
  } catch {
    throw new CliError("Cannot write output. Check the destination directory and permissions.");
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function main(): Promise<void> {
  const config = parseOptions(process.argv.slice(2));
  if (config.command === "help") {
    process.stdout.write(help);
    return;
  }
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18) || (major === 23 && minor < 6)) {
    throw new CliError("The CLI requires Node 22.18+, 23.6+, or 24+. The core library has no Node dependency.");
  }
  const source = readSource(config.sourceEnv);
  const results = await validate(config.schemas, source);
  if (config.command === "export") {
    await writeOutput(config.output, dockerEnv(results));
    console.log(`Validated ${results.length} schema(s) and wrote docker-env output.`);
  } else {
    console.log(`Validated ${results.length} schema(s).`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof CliError ? error.message : "Environment command failed (unexpected error details withheld).");
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
});
