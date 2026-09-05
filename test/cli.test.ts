import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let directory: string;
let cli: string;
let sequence = 0;
const secret = "secret-value-must-never-appear";

before(() => {
  directory = mkdtempSync(join(tmpdir(), "mavu-env-package-"));
  // Exercise the installed tarball, including bin registration and shared chunks.
  const packed = JSON.parse(execFileSync("npm", ["pack", "--cache", join(directory, "cache"), "--json", "--pack-destination", directory], {
    cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  })) as { filename: string }[];
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--cache", join(directory, "cache"), "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(directory, packed[0]!.filename)], {
    cwd: directory, stdio: "pipe",
  });
  cli = join(directory, "node_modules", "@ma.vu", "env", "dist", "cli.js");
});

after(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function schema(expression: string, exportName = "default", extension = "ts") {
  const path = join(directory, `schema-${sequence++}.${extension}`);
  const declaration = exportName === "default" ? "export default" : `export const ${exportName} =`;
  writeFileSync(path, `import { createEnv, required, optional, number, boolean } from '@ma.vu/env';\n${declaration} createEnv(${expression});\n`);
  return path;
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: directory, encoding: "utf8",
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
}

function exportArgs(path: string, output = join(directory, `output-${sequence++}`)) {
  return { output, args: ["export", "--schema", path, "--source-env", "CI_CONFIG", "--format", "docker-env", "--output", output] };
}

function assertFailure(result: ReturnType<typeof run>, status = 1) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, status, result.stdout + result.stderr);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret), "must not print input values");
}

test("installed bin resolves and documents the commands", () => {
  assert.ok(existsSync(join(directory, "node_modules", ".bin", "mavu-env")));
  const help = execFileSync("npm", ["exec", "--cache", join(directory, "cache"), "--offline", "--", "mavu-env", "--help"], { cwd: directory, encoding: "utf8" });
  assert.match(help, /mavu-env check/);
  assert.match(help, /mavu-env export/);
  const scoped = execFileSync("npx", ["--cache", join(directory, "cache"), "--offline", "@ma.vu/env", "--help"], { cwd: directory, encoding: "utf8" });
  assert.match(scoped, /mavu-env check/);
});

test("checks native TypeScript using the process environment without loading .env", () => {
  const path = schema("{ TOKEN: required, PORT: number.min(1), DEBUG: boolean }");
  writeFileSync(join(directory, ".env"), `TOKEN=${secret}\nPORT=3000\n`);
  const missing = run(["check", "--schema", path]);
  assertFailure(missing);
  assert.match(missing.stderr, /TOKEN: required/);
  const success = run(["check", "--schema", path], { TOKEN: secret, PORT: "3000", DEBUG: "1" });
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /Validated 1 schema/);
  assert.ok(!success.stdout.includes(secret));
});

test("JSON source is explicit and never falls back to process.env", () => {
  const path = schema("{ TOKEN: required }");
  assert.equal(run(["check", "--schema", path, "--source-env", "CI_CONFIG"], { CI_CONFIG: JSON.stringify({ TOKEN: secret }) }).status, 0);
  const result = run(["check", "--schema", path, "--source-env", "CI_CONFIG"], { TOKEN: secret, CI_CONFIG: "{}" });
  assertFailure(result);
  assert.match(result.stderr, /TOKEN: required/);
});

for (const input of [undefined, `{"TOKEN":"${secret}`, `"${secret}"`, "null", "[]", '{"TOKEN":42}', '{"TOKEN":true}', '{"TOKEN":{}}']) {
  test(`rejects missing, malformed or non-string JSON source: ${sequence++}`, () => {
    const result = run(["check", "--schema", schema("{ TOKEN: required }"), "--source-env", "CI_CONFIG"], input === undefined ? {} : { CI_CONFIG: input });
    assertFailure(result);
    assert.match(result.stderr, /Source variable CI_CONFIG/);
  });
}

test("aggregates errors from all schemas and redacts invalid values", () => {
  const first = schema("{ WEB_TOKEN: required, PORT: number }");
  const second = schema("{ JOB_TOKEN: required, DEBUG: boolean }");
  const result = run(["check", "--schema", first, "--schema", second], { PORT: secret, DEBUG: secret });
  assertFailure(result);
  for (const expected of [/Schema 1:/, /Schema 2:/, /WEB_TOKEN: required/, /JOB_TOKEN: required/, /PORT: expected number/, /DEBUG: expected boolean/]) {
    assert.match(result.stderr, expected);
  }
});

test("supports named exports, JavaScript and explicit selection", () => {
  const named = schema("{ TOKEN: required }", "env", "mjs");
  assert.equal(run(["check", "--schema", named], { TOKEN: secret }).status, 0);
  const path = join(directory, "multiple.mts");
  writeFileSync(path, "import { createEnv, required } from '@ma.vu/env'; export const web = createEnv({ WEB: required }); export const jobs = createEnv({ JOBS: required });");
  assertFailure(run(["check", "--schema", path]));
  assert.equal(run(["check", "--schema", `${path}#web`], { WEB: secret }).status, 0);
  assertFailure(run(["check", "--schema", `${path}#missing`]));
});

test("schema import and unexpected validation exceptions do not expose messages or source", () => {
  for (const content of [`throw new Error('${secret}')`, `export default { keys: ['TOKEN'], parse() { throw new Error('${secret}'); } }`, `export default '${secret}'`]) {
    const path = join(directory, `broken-${sequence++}.mjs`);
    writeFileSync(path, content);
    assertFailure(run(["check", "--schema", path]));
  }
  assertFailure(run(["check", "--schema", "missing.ts"]));
});

for (const args of [[], ["invalid"], ["check"], ["check", "--schema", ""], ["check", "--unknown", secret], ["check", "--schema", "x", "--source-env", ""], ["check", "--schema", "x", "--output", "x"], ["export", "--schema", "x"], ["export", "--schema", "x", "--format", "shell", "--output", "x"]]) {
  test(`usage errors fail with exit 2: ${args[0] ?? "empty"} ${sequence++}`, () => assertFailure(run(args), 2));
}

test("exports only declared, normalized values and preserves Docker literal characters", () => {
  const path = schema("{ TOKEN: required, PORT: number, DEBUG: boolean, EMPTY: optional }");
  const literal = `${secret} #hash=$HOME \\ backslash 'single' \"double\" = 💜`;
  const { output, args } = exportArgs(path);
  const result = run(args, { CI_CONFIG: JSON.stringify({ TOKEN: ` ${literal} `, PORT: "00", DEBUG: "0", UNDECLARED: "must-not-export" }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, "utf8"), `TOKEN=${literal}\nPORT=0\nDEBUG=false\nEMPTY=\n`);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  if (process.platform !== "win32") assert.equal(statSync(output).mode & 0o777, 0o600);
});

test("merges matching shared keys but rejects conflicting parsed values", () => {
  const first = schema("{ SHARED: required, WEB: required }");
  const second = schema("{ SHARED: required, JOB: required }");
  const { output, args } = exportArgs(first);
  const source = { SHARED: "01", WEB: secret, JOB: "job" };
  const result = run([...args, "--schema", second], { CI_CONFIG: JSON.stringify(source) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, "utf8"), `SHARED=01\nWEB=${secret}\nJOB=job\n`);
  const conflict = schema("{ SHARED: number }");
  assertFailure(run([...args, "--schema", conflict], { CI_CONFIG: JSON.stringify(source) }));
  assert.equal(readFileSync(output, "utf8"), `SHARED=01\nWEB=${secret}\nJOB=job\n`);
});

for (const value of [`${secret}\nINJECTED=value`, `${secret}\rvalue`, `${secret}\0value`, `${secret}\ud800`, secret + "x".repeat(65536)]) {
  test(`unrepresentable Docker values fail without touching output: ${sequence++}`, () => {
    const { output, args } = exportArgs(schema("{ TOKEN: required }"));
    writeFileSync(output, "existing output\n");
    const result = run(args, { CI_CONFIG: JSON.stringify({ TOKEN: value }) });
    assertFailure(result);
    assert.match(result.stderr, /TOKEN:/);
    assert.equal(readFileSync(output, "utf8"), "existing output\n");
  });
}

test("validation errors leave output absent or preserve an existing file", () => {
  const { output, args } = exportArgs(schema("{ TOKEN: required }"));
  assertFailure(run(args, { CI_CONFIG: "{}" }));
  assert.equal(existsSync(output), false);
  writeFileSync(output, "previous");
  assertFailure(run([...args, "--schema", schema("{ MISSING: required }")], { CI_CONFIG: JSON.stringify({ TOKEN: secret }) }));
  assert.equal(readFileSync(output, "utf8"), "previous");
});

test("successful replacement resets file permissions and write failures clean temporary files", () => {
  const path = schema("{ TOKEN: required }");
  const { output, args } = exportArgs(path);
  writeFileSync(output, "previous");
  chmodSync(output, 0o644);
  assert.equal(run(args, { CI_CONFIG: JSON.stringify({ TOKEN: secret }) }).status, 0);
  if (process.platform !== "win32") assert.equal(statSync(output).mode & 0o777, 0o600);
  const failure = exportArgs(path, directory);
  assertFailure(run(failure.args, { CI_CONFIG: JSON.stringify({ TOKEN: secret }) }));
  assert.deepEqual(readdirSync(directory).filter((name) => name.startsWith(".mavu-env-")), []);
});

test("Docker consumes exported values literally", { skip: process.env.MAVU_TEST_DOCKER !== "1" }, () => {
  const { output, args } = exportArgs(schema("{ TOKEN: required, PORT: number, DEBUG: boolean, EMPTY: optional }"));
  const literal = `${secret} #hash=$HOME \\ backslash 'single' \"double\" = 💜`;
  assert.equal(run(args, { CI_CONFIG: JSON.stringify({ TOKEN: literal, PORT: "0", DEBUG: "false" }) }).status, 0);
  const received = execFileSync("docker", ["run", "--rm", "--env-file", output, "alpine:3.22", "sh", "-c", 'printf "%s\\n" "$TOKEN" "$PORT" "$DEBUG" "$EMPTY"'], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(received, `${literal}\n0\nfalse\n\n`);
});

test("documented platform schemas validate from the installed package", () => {
  const values: Record<string, Record<string, string>> = {
    backend: { DATABASE_URL: "postgres://localhost/app", PORT: "3000", DEBUG: "false" },
    web: { VITE_API_URL: "https://api.example.com", VITE_TIMEOUT: "1000" },
    "react-native": { EXPO_PUBLIC_API_URL: "https://api.example.com", EXPO_PUBLIC_TIMEOUT: "1000" },
  };
  for (const [platform, source] of Object.entries(values)) {
    const path = join(directory, `${platform}.ts`);
    writeFileSync(path, readFileSync(join(repository, "examples", platform, "env.schema.ts")));
    const success = run(["check", "--schema", path], source);
    assert.equal(success.status, 0, success.stderr);
    assertFailure(run(["check", "--schema", path]));
  }
});

test("projects can opt into tsx for schemas requiring TypeScript transforms", () => {
  const path = join(directory, "enum-schema.ts");
  writeFileSync(path, "import { createEnv, number } from '@ma.vu/env'; enum Limit { Min = 1 } export default createEnv({ PORT: number.min(Limit.Min) });");
  assertFailure(run(["check", "--schema", path], { PORT: "3000" }));
  const result = spawnSync(process.execPath, [cli, "check", "--schema", path], {
    cwd: repository, encoding: "utf8",
    env: { PATH: process.env.PATH, NODE_OPTIONS: "--import tsx", PORT: "3000" },
  });
  assert.equal(result.status, 0, result.stderr);
});
