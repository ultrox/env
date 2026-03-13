# @ma.vu/env

Zero-dependency env validation with a builder API. Type-safe, no schema library needed.

[![npm](https://img.shields.io/npm/v/@ma.vu/env)](https://www.npmjs.com/package/@ma.vu/env)

## Why

Env vars are strings. You need to know: is it present? What type? Any length constraints? That's it. No reason to pull in a schema library for that.

- Zero runtime dependencies
- Full TypeScript inference — `parse()` returns typed data matching your schema
- Immutable builder API — `.min()`, `.max()` return new descriptors
- Built-in CLI — reads `.env` files, `SECRETS_JSON`, writes validated output

## Install

```
npm install @ma.vu/env
```

## Usage

### Define a schema

```ts
// bin/env.ts
import { createEnv, required, optional, number, boolean } from '@ma.vu/env';

export const env = createEnv({
  CLERK_SECRET_KEY: required,
  API_KEY: required.min(5).max(100),
  DATABASE_URL: optional,
  PORT: number,
  DEBUG: boolean,
});
```

### Validate at runtime

```ts
// src/server/config.ts
import { env } from '../bin/env.js';

const { data, errors, warnings } = env.parse(process.env);
if (errors.length) throw new Error(errors.join('\n'));
if (warnings.length) console.warn(`Optional: ${warnings.join(', ')}`);

export const config = data;
// config.CLERK_SECRET_KEY → string
// config.PORT             → number
// config.DEBUG            → boolean
```

### Validate in CI

```ts
// bin/validate-env.ts
import { env } from './env.js';
env.cli();
```

```bash
# Validate an existing .env file
npx tsx bin/validate-env.ts .env

# Generate .env from CI secrets
npx tsx bin/validate-env.ts --write .env.deploy
# (reads from SECRETS_JSON env var)
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

- **`parse(source)`** — validates `source` (e.g. `process.env`), returns `{ data, errors, warnings }`
- **`cli()`** — reads args, validates, writes `.env`, exits with code
- **`keys`** — array of all keys from the schema

### CLI modes

| Usage | Behavior |
|-------|----------|
| `script .env` | Validates the `.env` file |
| `script --write .env.deploy` | Reads `SECRETS_JSON` env var, validates, writes output file |

## License

MIT
