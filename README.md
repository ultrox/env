# @ma.vu/env

Zero-dependency env validation with a builder API. Type-safe, no schema library needed.

[![npm](https://img.shields.io/npm/v/@ma.vu/env)](https://www.npmjs.com/package/@ma.vu/env)

## Why

Env vars are strings. You need to know: is it present? What type? Any length constraints? That's it. No reason to pull in a schema library for that.

- Zero runtime dependencies
- Full TypeScript inference — `parse()` returns typed data matching your schema
- Immutable builder API — `.min()`, `.max()` return new descriptors
- `parse()` throws on missing required vars, warns on missing optional vars

## Install

```
npm install @ma.vu/env
```

## Usage

### Define a schema

```ts
// config/env.config.ts
import { createEnv, required, optional, number, boolean } from '@ma.vu/env';

export const env = createEnv({
  CLERK_SECRET_KEY: required,
  API_KEY: required.min(5).max(100),
  DATABASE_URL: optional,
  PORT: number,
  DEBUG: boolean,
});
```

### Use in your app

```ts
// config/app.config.ts
import { env } from './env.config';

const { data, warnings } = env.parse(process.env);
// Throws if required vars are missing
// Warns about missing optional vars

export const config = data;
// config.CLERK_SECRET_KEY → string
// config.PORT             → number
// config.DEBUG            → boolean
```

### Generate .env in CI

```ts
// bin/validate-env.ts
import { env } from '../src/server/config/env.config.js';

const source = JSON.parse(process.argv[2]);
env.writeEnvFile({ source, output: process.argv[3] });
```

```yaml
- name: Generate and validate .env
  run: npx tsx bin/validate-env.ts '${{ toJSON(secrets) }}' .env.deploy
```

`toJSON(secrets)` dumps all GitHub secrets as a JSON string. The script parses it, validates against the schema (throws on errors), and writes a `.env` file. Empty optional values are skipped.

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

- **`parse(source)`** — validates `source` against the schema. Throws on errors, warns on missing optional. Returns `{ data, warnings }`
- **`writeEnvFile({ source, output })`** — validates and writes a `.env` file. Throws on errors
- **`keys`** — array of all keys from the schema

## License

MIT
