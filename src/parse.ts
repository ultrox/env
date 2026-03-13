import type {
  Descriptor,
  StringDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
} from "./descriptors.js";

export type EnvSchema = Record<string, Descriptor>;

export type InferEnv<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends NumberDescriptor
    ? number
    : S[K] extends BooleanDescriptor
      ? boolean
      : string;
};

export interface ParseResult<S extends EnvSchema> {
  data: InferEnv<S>;
  errors: string[];
  warnings: string[];
}

export function parse<S extends EnvSchema>(
  schema: S,
  source: Record<string, string | undefined>,
): ParseResult<S> {
  const data = {} as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, descriptor] of Object.entries(schema)) {
    const raw = source[key];

    if (descriptor.type === "string") {
      const d = descriptor as StringDescriptor;
      const trimmed = (raw ?? "").trim();

      if (d.isRequired && trimmed.length === 0) {
        errors.push(`${key}: required`);
        data[key] = "";
        continue;
      }

      if (!d.isRequired && trimmed.length === 0) {
        warnings.push(key);
        data[key] = "";
        continue;
      }

      if (d.minLen !== undefined && trimmed.length < d.minLen) {
        errors.push(`${key}: min length ${d.minLen}, got ${trimmed.length}`);
      }
      if (d.maxLen !== undefined && trimmed.length > d.maxLen) {
        errors.push(`${key}: max length ${d.maxLen}, got ${trimmed.length}`);
      }

      data[key] = trimmed;
    } else if (descriptor.type === "number") {
      const d = descriptor as NumberDescriptor;
      const trimmed = (raw ?? "").trim();

      if (trimmed.length === 0) {
        errors.push(`${key}: required`);
        data[key] = 0;
        continue;
      }

      const num = Number(trimmed);
      if (isNaN(num)) {
        errors.push(`${key}: expected number, got "${trimmed}"`);
        data[key] = 0;
        continue;
      }

      if (d.minVal !== undefined && num < d.minVal) {
        errors.push(`${key}: min ${d.minVal}, got ${num}`);
      }
      if (d.maxVal !== undefined && num > d.maxVal) {
        errors.push(`${key}: max ${d.maxVal}, got ${num}`);
      }

      data[key] = num;
    } else if (descriptor.type === "boolean") {
      const trimmed = (raw ?? "").trim().toLowerCase();

      if (trimmed === "true" || trimmed === "1") {
        data[key] = true;
      } else if (
        trimmed === "false" ||
        trimmed === "0" ||
        trimmed === ""
      ) {
        data[key] = false;
      } else {
        errors.push(
          `${key}: expected boolean (true/false/1/0), got "${trimmed}"`,
        );
        data[key] = false;
      }
    }
  }

  return { data: data as InferEnv<S>, errors, warnings };
}
