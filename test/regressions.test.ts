import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createEnv, required, optional, number, boolean } from "../src/index.js";

const schema = createEnv({ VALUE: required });

describe("validation at the application and CI boundaries", () => {
  it("returns only declared keys and preserves typed false and zero", () => {
    const env = createEnv({ PORT: number, DEBUG: boolean, ABSENT: optional });
    const { data } = env.parse({ PORT: "0", DEBUG: "false", EXTRA_SECRET: "hidden" });
    assert.deepEqual(data, { PORT: 0, DEBUG: false, ABSENT: "" });
  });

  const env = createEnv({ COUNT: number.min(1).max(10), ENABLED: boolean, TOKEN: required });

  it("reports all invalid configuration keys and rules", () => {
    const source = { COUNT: "0", ENABLED: "invalid", TOKEN: "" };
    assert.throws(() => env.parse(source), (error: Error) => {
      assert.match(error.message, /COUNT: min 1/);
      assert.match(error.message, /ENABLED: expected boolean/);
      assert.match(error.message, /TOKEN: required/);
      return true;
    });
  });

  it("does not disclose rejected values", () => {
    const secret = "canary-secret-123";
    assert.throws(() => env.parse({ COUNT: secret, ENABLED: secret, TOKEN: "valid" }),
      (error: Error) => !error.message.includes(secret));
    assert.throws(() => env.parse({ COUNT: "123456789", ENABLED: "false", TOKEN: "valid" }),
      (error: Error) => !error.message.includes("123456789"));
  });

  it("rejects non-string source values with a useful key-only error", () => {
    for (const value of [42, true, {}, [], null]) {
      const source = { VALUE: value } as unknown as Record<string, string>;
      assert.throws(() => schema.parse(source), /VALUE: expected a string/);
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

  it("rejects invalid environment variable names", () => {
    for (const key of ["BAD\nKEY", "KEY=value", "KEY; echo", "1KEY"]) {
      assert.throws(() => createEnv({ [key]: required }), /Invalid environment variable name/);
    }
  });

  it("keeps the schema consistent if the caller changes its input", () => {
    const input = { VALUE: required };
    const env = createEnv(input);
    input.VALUE = optional;
    assert.throws(() => env.parse({}), /VALUE: required/);
    assert.throws(() => (env.keys as string[]).push("EXTRA"), TypeError);
  });
});
