import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createEnv,
  required,
  optional,
  number,
  boolean,
  StringDescriptor,
  NumberDescriptor,
} from "../src/index.js";

describe("descriptors", () => {
  it("required defaults to min 1", () => {
    assert.equal(required.minLen, 1);
    assert.equal(required.isRequired, true);
  });

  it("optional defaults to no constraints", () => {
    assert.equal(optional.minLen, undefined);
    assert.equal(optional.isRequired, false);
  });

  it(".min() returns new immutable descriptor", () => {
    const r = required.min(5);
    assert.ok(r instanceof StringDescriptor);
    assert.equal(r.minLen, 5);
    assert.equal(required.minLen, 1); // original unchanged
  });

  it(".max() returns new immutable descriptor", () => {
    const r = required.max(100);
    assert.equal(r.maxLen, 100);
    assert.equal(required.maxLen, undefined);
  });

  it("chaining .min().max()", () => {
    const r = required.min(5).max(100);
    assert.equal(r.minLen, 5);
    assert.equal(r.maxLen, 100);
    assert.equal(r.isRequired, true);
  });

  it("number descriptor has min/max", () => {
    const n = number.min(0).max(65535);
    assert.ok(n instanceof NumberDescriptor);
    assert.equal(n.minVal, 0);
    assert.equal(n.maxVal, 65535);
    assert.equal(number.minVal, undefined); // original unchanged
  });
});

describe("parse — required string", () => {
  const env = createEnv({ FOO: required });

  it("missing → throws", () => {
    assert.throws(() => env.parse({}), /FOO: required/);
  });

  it("empty string → throws", () => {
    assert.throws(() => env.parse({ FOO: "" }), /FOO: required/);
  });

  it("whitespace only → throws", () => {
    assert.throws(() => env.parse({ FOO: "   " }), /FOO: required/);
  });

  it("valid → trimmed data", () => {
    const { data } = env.parse({ FOO: "  hello  " });
    assert.equal(data.FOO, "hello");
  });
});

describe("parse — optional string", () => {
  const env = createEnv({ BAR: optional });

  it("missing → empty string + warning", () => {
    const { data, warnings } = env.parse({});
    assert.equal(data.BAR, "");
    assert.deepEqual(warnings, ["BAR"]);
  });

  it("present → trimmed data, no warning", () => {
    const { data, warnings } = env.parse({ BAR: " value " });
    assert.equal(data.BAR, "value");
    assert.equal(warnings.length, 0);
  });
});

describe("parse — min/max length", () => {
  const env = createEnv({ KEY: required.min(5).max(10) });

  it("too short → throws", () => {
    assert.throws(() => env.parse({ KEY: "abc" }), /min length 5/);
  });

  it("too long → throws", () => {
    assert.throws(() => env.parse({ KEY: "a".repeat(11) }), /max length 10/);
  });

  it("within range → ok", () => {
    const { data } = env.parse({ KEY: "abcdef" });
    assert.equal(data.KEY, "abcdef");
  });
});

describe("parse — number", () => {
  const env = createEnv({ PORT: number });

  it("missing → throws", () => {
    assert.throws(() => env.parse({}), /PORT: required/);
  });

  it("NaN → throws", () => {
    assert.throws(() => env.parse({ PORT: "abc" }), /expected number/);
  });

  it("valid → coerced number", () => {
    const { data } = env.parse({ PORT: "3000" });
    assert.strictEqual(data.PORT, 3000);
  });

  it("respects min/max", () => {
    const env2 = createEnv({ PORT: number.min(1).max(65535) });
    assert.throws(() => env2.parse({ PORT: "0" }), /min 1/);
  });
});

describe("parse — boolean", () => {
  const env = createEnv({ DEBUG: boolean });

  it('"true" → true', () => {
    const { data } = env.parse({ DEBUG: "true" });
    assert.strictEqual(data.DEBUG, true);
  });

  it('"1" → true', () => {
    const { data } = env.parse({ DEBUG: "1" });
    assert.strictEqual(data.DEBUG, true);
  });

  it('"false" → false', () => {
    const { data } = env.parse({ DEBUG: "false" });
    assert.strictEqual(data.DEBUG, false);
  });

  it('"0" → false', () => {
    const { data } = env.parse({ DEBUG: "0" });
    assert.strictEqual(data.DEBUG, false);
  });

  it("empty → false", () => {
    const { data } = env.parse({ DEBUG: "" });
    assert.strictEqual(data.DEBUG, false);
  });

  it("missing → false", () => {
    const { data } = env.parse({});
    assert.strictEqual(data.DEBUG, false);
  });

  it("invalid → throws", () => {
    assert.throws(() => env.parse({ DEBUG: "yes" }), /expected boolean/);
  });
});

describe("parse — multiple errors", () => {
  it("collects all errors in one throw", () => {
    const env = createEnv({
      A: required,
      B: required,
      C: number,
    });
    assert.throws(() => env.parse({}), (err: Error) => {
      assert.ok(err.message.includes("A: required"));
      assert.ok(err.message.includes("B: required"));
      assert.ok(err.message.includes("C: required"));
      return true;
    });
  });
});

describe("createEnv — keys", () => {
  it("returns all schema keys", () => {
    const env = createEnv({ A: required, B: optional, C: number });
    assert.deepEqual(env.keys, ["A", "B", "C"]);
  });
});

describe("writeEnvFile", () => {
  const env = createEnv({ HOST: required, PORT: number, API_KEY: optional });
  const tmp = mkdtempSync(join(tmpdir(), "env-test-write-"));

  it("writes validated env file", () => {
    const outFile = join(tmp, "out.env");
    env.writeEnvFile({
      source: { HOST: "prod.example.com", PORT: "443", API_KEY: "sk-123" },
      output: outFile,
    });
    const content = readFileSync(outFile, "utf-8");
    assert.ok(content.includes("HOST=prod.example.com"));
    assert.ok(content.includes("PORT=443"));
    assert.ok(content.includes("API_KEY=sk-123"));
  });

  it("skips empty optional values", () => {
    const outFile = join(tmp, "sparse.env");
    env.writeEnvFile({
      source: { HOST: "h", PORT: "80" },
      output: outFile,
    });
    const content = readFileSync(outFile, "utf-8");
    assert.ok(content.includes("HOST=h"));
    assert.ok(!content.includes("API_KEY"));
  });

  it("throws on missing required", () => {
    const outFile = join(tmp, "fail.env");
    assert.throws(
      () => env.writeEnvFile({ source: { PORT: "3000" }, output: outFile }),
      /HOST: required/,
    );
  });

  it("throws on invalid values", () => {
    const outFile = join(tmp, "fail2.env");
    assert.throws(
      () => env.writeEnvFile({ source: { HOST: "ok", PORT: "abc" }, output: outFile }),
      /expected number/,
    );
  });
});
