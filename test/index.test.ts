import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
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

  it("missing → error", () => {
    const { errors } = env.parse({});
    assert.equal(errors.length, 1);
    assert.match(errors[0], /FOO: required/);
  });

  it("empty string → error", () => {
    const { errors } = env.parse({ FOO: "" });
    assert.equal(errors.length, 1);
  });

  it("whitespace only → error", () => {
    const { errors } = env.parse({ FOO: "   " });
    assert.equal(errors.length, 1);
  });

  it("valid → trimmed data", () => {
    const { data, errors } = env.parse({ FOO: "  hello  " });
    assert.equal(errors.length, 0);
    assert.equal(data.FOO, "hello");
  });
});

describe("parse — optional string", () => {
  const env = createEnv({ BAR: optional });

  it("missing → empty string + warning", () => {
    const { data, errors, warnings } = env.parse({});
    assert.equal(errors.length, 0);
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

  it("too short → error", () => {
    const { errors } = env.parse({ KEY: "abc" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /min length 5/);
  });

  it("too long → error", () => {
    const { errors } = env.parse({ KEY: "a".repeat(11) });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /max length 10/);
  });

  it("within range → ok", () => {
    const { errors } = env.parse({ KEY: "abcdef" });
    assert.equal(errors.length, 0);
  });
});

describe("parse — number", () => {
  const env = createEnv({ PORT: number });

  it("missing → error", () => {
    const { errors } = env.parse({});
    assert.equal(errors.length, 1);
    assert.match(errors[0], /PORT: required/);
  });

  it("NaN → error", () => {
    const { errors } = env.parse({ PORT: "abc" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /expected number/);
  });

  it("valid → coerced number", () => {
    const { data, errors } = env.parse({ PORT: "3000" });
    assert.equal(errors.length, 0);
    assert.strictEqual(data.PORT, 3000);
  });

  it("respects min/max", () => {
    const env2 = createEnv({ PORT: number.min(1).max(65535) });
    const { errors } = env2.parse({ PORT: "0" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /min 1/);
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
    const { data, errors } = env.parse({ DEBUG: "" });
    assert.equal(errors.length, 0);
    assert.strictEqual(data.DEBUG, false);
  });

  it("missing → false", () => {
    const { data, errors } = env.parse({});
    assert.equal(errors.length, 0);
    assert.strictEqual(data.DEBUG, false);
  });

  it("invalid → error", () => {
    const { errors } = env.parse({ DEBUG: "yes" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /expected boolean/);
  });
});

describe("parse — multiple errors", () => {
  it("collects all errors at once", () => {
    const env = createEnv({
      A: required,
      B: required,
      C: number,
    });
    const { errors } = env.parse({});
    assert.equal(errors.length, 3);
  });
});

describe("createEnv — keys", () => {
  it("returns all schema keys", () => {
    const env = createEnv({ A: required, B: optional, C: number });
    assert.deepEqual(env.keys, ["A", "B", "C"]);
  });
});
