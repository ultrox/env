import { after, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { createEnv, required, optional, number, boolean } from "../src/index.js";

const tmp = mkdtempSync(join(tmpdir(), "env-regressions-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const schema = createEnv({ VALUE: required });
const childEnv = { PATH: process.env.PATH, EXPANSION_CANARY: "expanded" };
const hasDirenv = spawnSync("direnv", ["version"], { env: childEnv }).status === 0;

function loadShell(script: string): Record<string, string> {
  const result = spawnSync("/bin/sh", ["-s", "--", process.execPath], {
    input: `${script}\nexec "$1" -e 'process.stdout.write(JSON.stringify({ VALUE: process.env.VALUE, INJECTED: process.env.INJECTED }))'`,
    encoding: "utf8",
    env: childEnv,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("validated values survive file loading", () => {
  const values = [
    "abc#def",
    "two words",
    "a=b",
    "it's a password",
    'a "quoted" value',
    String.raw`C:\new\route`,
    "$EXPANSION_CANARY ${EXPANSION_CANARY}",
    "$(printf EXECUTED); `printf EXECUTED` & !",
    "line one\nINJECTED=yes",
    "unicode: café 🔑",
  ];

  for (const [index, value] of values.entries()) {
    it(`round-trips dotenv value ${index} through Node`, () => {
      const output = join(tmp, `node-${index}.env`);
      schema.writeEnvFile({ source: { VALUE: value }, output });
      assert.deepEqual(parseEnv(readFileSync(output, "utf8")), { VALUE: value });
    });

    it(`round-trips dotenv value ${index} through direnv`, { skip: !hasDirenv }, () => {
      const output = join(tmp, `direnv-${index}.env`);
      schema.writeEnvFile({ source: { VALUE: value }, output });
      const result = spawnSync("direnv", ["dotenv", "bash", output], {
        encoding: "utf8",
        env: childEnv,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(loadShell(result.stdout), { VALUE: value });
    });
  }

  for (const [index, value] of [...values, "line one\r\nline two", 'it\'s "complex" \\ $EXPANSION_CANARY\nINJECTED=yes'].entries()) {
    it(`round-trips shell value ${index} without executing it`, () => {
      const output = join(tmp, `shell-${index}.sh`);
      schema.writeEnvFile({ source: { VALUE: value }, output, format: "shell" });
      assert.deepEqual(loadShell(readFileSync(output, "utf8")), { VALUE: value });
    });
  }

  it("fails before overwriting a file when dotenv cannot preserve the value", () => {
    const output = join(tmp, "preserve.env");
    writeFileSync(output, "previous content");
    const value = 'secret\'s "$VALUE"';
    assert.throws(() => schema.writeEnvFile({ source: { VALUE: value }, output }), (error: Error) => {
      assert.match(error.message, /VALUE: cannot be represented/);
      assert.ok(!error.message.includes(value));
      return true;
    });
    assert.equal(readFileSync(output, "utf8"), "previous content");
  });

  it("writes only declared keys and preserves typed false and zero", () => {
    const env = createEnv({ PORT: number, DEBUG: boolean, ABSENT: optional });
    const output = join(tmp, "typed.env");
    env.writeEnvFile({ source: { PORT: "0", DEBUG: "false", EXTRA_SECRET: "hidden" }, output });
    assert.deepEqual(parseEnv(readFileSync(output, "utf8")), { PORT: "0", DEBUG: "false" });
  });

  it("rejects carriage returns that dotenv readers handle differently", () => {
    assert.throws(() => schema.writeEnvFile({
      source: { VALUE: "line one\r\nline two" }, output: join(tmp, "crlf.env"),
    }), /VALUE: cannot be represented/);
  });
});

describe("validation at the application and CI boundaries", () => {
  const env = createEnv({ COUNT: number.min(1).max(10), ENABLED: boolean, TOKEN: required });

  it("uses the same rules locally and for CI JSON input", () => {
    const source = { COUNT: "0", ENABLED: "invalid", TOKEN: "" };
    let localError = "";
    assert.throws(() => env.parse(source), (error: Error) => {
      localError = error.message;
      assert.match(localError, /COUNT: min 1/);
      assert.match(localError, /ENABLED: expected boolean/);
      assert.match(localError, /TOKEN: required/);
      return true;
    });
    assert.throws(() => env.writeEnvFile({ source: JSON.stringify(source), output: join(tmp, "invalid.env") }),
      (error: Error) => error.message === localError);
  });

  it("does not disclose rejected values or malformed JSON", () => {
    const secret = "canary-secret-123";
    for (const action of [
      () => env.parse({ COUNT: secret, ENABLED: secret, TOKEN: "valid" }),
      () => env.writeEnvFile({ source: `{"TOKEN":"${secret}",`, output: join(tmp, "secret.env") }),
    ]) {
      assert.throws(action, (error: Error) => !error.message.includes(secret));
    }
    assert.throws(() => env.parse({ COUNT: "123456789", ENABLED: "false", TOKEN: "valid" }),
      (error: Error) => !error.message.includes("123456789"));
  });

  it("rejects non-string JSON values with a useful key-only error", () => {
    for (const value of [42, true, {}, [], null]) {
      assert.throws(() => schema.writeEnvFile({
        source: JSON.stringify({ VALUE: value }), output: join(tmp, "wrong-type.env"),
      }), /VALUE: expected a string/);
    }
  });

  it("rejects null bytes before they reach the process environment", () => {
    assert.throws(() => schema.parse({ VALUE: "secret\0suffix" }), /VALUE: must not contain a null byte/);
  });

  it("rejects infinite numbers including numeric overflow", () => {
    for (const value of ["Infinity", "-Infinity", "1e999"]) {
      assert.throws(() => createEnv({ VALUE: number }).parse({ VALUE: value }), /VALUE: expected number/);
    }
  });

  it("does not treat inherited properties as supplied configuration", () => {
    assert.throws(() => schema.parse(Object.create({ VALUE: "inherited" })), /VALUE: required/);
  });

  it("preserves a declared __proto__ key as ordinary data", () => {
    const env = createEnv({ ["__proto__"]: required });
    const { data } = env.parse(JSON.parse('{"__proto__":"literal"}'));
    assert.equal(Object.getPrototypeOf(data), Object.prototype);
    assert.equal(Object.getOwnPropertyDescriptor(data, "__proto__")?.value, "literal");
  });

  it("rejects keys that could introduce file syntax", () => {
    for (const key of ["BAD\nKEY", "KEY=value", "KEY; echo", "1KEY"]) {
      assert.throws(() => createEnv({ [key]: required }), /Invalid environment variable name/);
    }
  });

  it("keeps parsing and writing consistent if the caller changes the schema", () => {
    const input = { VALUE: required };
    const env = createEnv(input);
    input.VALUE = optional;
    assert.throws(() => env.parse({}), /VALUE: required/);
    assert.throws(() => (env.keys as string[]).push("EXTRA"), TypeError);
  });
});
