# @ma.vu/env

Zero-dependency env validation with a builder API. Type-safe, no schema library needed.

[![npm](https://img.shields.io/npm/v/@ma.vu/env)](https://www.npmjs.com/package/@ma.vu/env)

## Why

Env vars are strings. You need to know: is it present? What type? Any length constraints? That's it. No reason to pull in a schema library for that.

- Zero runtime dependencies
- Full TypeScript inference — `parse()` returns typed data matching your schema
- Immutable builder API — `.min()`, `.max()` return new descriptors
- Built-in CLI for CI pipelines

## Install

```
npm install @ma.vu/env
```

## Usage

### Define a schema

```ts
// src/server/config.ts
import { createEnv, required, optional, number, boolean } from '@ma.vu/env';

export const env = createEnv({
  CLERK_SECRET_KEY: required,
  API_KEY: required.min(5).max(100),
  DATABASE_URL: optional,
  PORT: number,
  DEBUG: boolean,
});

// Lazy — called by the app, not by the CLI
export function loadConfig() {
  const { data, errors, warnings } = env.parse(process.env);
  if (errors.length) throw new Error(errors.join('\n'));
  if (warnings.length) console.warn(`Optional: ${warnings.join(', ')}`);
  return { config: data, configWarnings: warnings };
}
```

### Use in your app

```ts
import { loadConfig } from './config.js';

const { config } = loadConfig();
// config.CLERK_SECRET_KEY → string
// config.PORT             → number
// config.DEBUG            → boolean
```

### Validate in CI

```ts
// bin/validate-env.ts
import { env } from '../src/server/config.js';
env.cli();
```

The CLI script imports `env` (the schema) without triggering `loadConfig()`, so it doesn't try to parse `process.env`.

## Two ways to use: `parse()` vs `cli()`

### `parse(source)` — for your app at runtime

Takes any `Record<string, string | undefined>` (like `process.env`) and validates each key against the schema. Returns `{ data, errors, warnings }`. You call it, you handle the result.

```ts
const { data, errors, warnings } = env.parse(process.env);
```

### `cli()` — for CI pipelines

Reads args, determines the source, validates, and writes output. It handles the full flow and calls `process.exit()` on failure.

The CLI has its own convention for reading env vars. It does **not** read `process.env` directly. Instead it supports two modes:

**Validate mode** — reads a `.env` file and validates it:

```bash
npx tsx bin/validate-env.ts .env
```

Parses the file as `KEY=value` lines (ignoring comments and blank lines), then validates against the schema. Exits 0 on success, 1 on error.

**Write mode** — reads from `SECRETS_JSON`, validates, and writes a `.env` file:

```bash
npx tsx bin/validate-env.ts --write .env.deploy
```

Expects a `SECRETS_JSON` environment variable containing a JSON object of key-value pairs. Extracts only the keys defined in the schema, validates them, and writes the result as a `.env` file. This is designed for CI where secrets are available as a JSON blob (e.g. GitHub Actions `${{ toJSON(secrets) }}`).

**Why `SECRETS_JSON`?** — CI platforms like GitHub Actions can dump all secrets into one env var with `toJSON(secrets)`. The CLI unpacks it so you don't have to list each secret individually in the workflow. Add a key to your schema and it automatically gets picked up from the JSON — no workflow changes needed.

### Example GitHub Actions workflow

```yaml
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: pnpm
- run: pnpm install --frozen-lockfile

- name: Generate and validate .env
  run: npx tsx bin/validate-env.ts --write .env.deploy
  env:
    SECRETS_JSON: ${{ toJSON(secrets) }}
```

## API

### Primitives

| Export     | Type    | Behavior                                       |
|------------|---------|-------------------------------------------------|
| `required` | string  | Trimmed, must be non-empty (min length 1)      |
| `optional` | string  | Trimmed, defaults to `""`, appears in warnings if missing |
| `number`   | number  | Coerced via `Number()`, error if NaN            |
| `boolean`  | boolean | `"true"`/`"1"` → true, `"false"`/`"0"`/`""` → false |

### Modifiers

`.min(n)` and `.max(n)` return new descriptors (immutable):

```ts
required            // trimmed, min 1
required.min(5)     // trimmed, min 5
required.max(100)   // trimmed, max 100
optional.max(255)   // trimmed, defaults "", max 255 if provided
number.min(1).max(65535) // numeric range
```

### `createEnv(schema)`

Returns an object with:

- **`parse(source)`** — validates `source` against the schema, returns `{ data, errors, warnings }`
- **`cli()`** — CLI runner with validate and write modes (see above)
- **`keys`** — array of all keys from the schema

## License

MIT
