# @ma.vu/env

Zero-dependency env validation with a builder API. Type-safe, no schema library needed.

[![npm](https://img.shields.io/npm/v/@ma.vu/env)](https://www.npmjs.com/package/@ma.vu/env)

## Why

Define environment variables once, validate them locally and in CI, and give application code one typed `env` object. Catch missing or invalid configuration before development starts or a deployment proceeds.

The schema lives in its own module so the app and CI use exactly the same rules. One application module passes `process.env` to that schema and exports the validated result. Everywhere else imports `env`: autocomplete, known keys, and actual string, number, or boolean values.

Environment variables arrive as strings. This library checks presence, type, and bounds without a schema-library dependency.

- Zero runtime dependencies
- Full TypeScript inference — `parse()` returns typed data matching your schema
- Immutable builder API — `.min()`, `.max()` return new descriptors
- `parse()` throws on missing required vars, warns on missing optional vars

## Philosophy

One schema defines the configuration contract. Validate it before starting local work, validate deployment inputs in CI, and validate the supplied environment when the app initializes. Application modules consume a single typed `env` export; direct `process.env` access belongs at that boundary.

Environment loading belongs to the shell or deployment platform. This library validates the values you explicitly pass to it, usually `process.env`. We deliberately do not use `dotenv/config` or add automatic `.env` loading to application imports.

For local development, use [direnv](https://direnv.net/). Once installed and hooked into your shell, it loads an authorized `.envrc` when you enter the project and unloads those variables when you leave. If you keep local values in a `.env` file, load it explicitly from `.envrc`:

```sh
# .envrc
dotenv .env
```

Run `direnv allow` after reviewing `.envrc`, then start your app from that shell. Here, `dotenv` is a direnv shell helper; it does not require the npm `dotenv` package. Keep secret-bearing `.env` files out of version control.

In CI and production, have the runner or deployment platform supply the environment before starting the app. Keep the schema reusable so the same rules validate deployment inputs and application configuration.

## Install

```
npm install @ma.vu/env
```

## Usage

### Define the shared schema

```ts
// src/env.schema.ts
import { createEnv, required, optional, number, boolean } from '@ma.vu/env';

export const envSchema = createEnv({
  API_KEY: required.min(5),
  DATABASE_URL: required,
  OPTIONAL_SERVICE_URL: optional,
  PORT: number.min(1).max(65535),
  DEBUG: boolean,
});
```

Importing the schema does not read the environment or load files.

### Export one typed application environment

```ts
// src/env.ts — the application's process.env boundary
import { envSchema } from './env.schema';

export const { data: env, warnings: envWarnings } = envSchema.parse(process.env);
```

```ts
// src/server.ts
import { env } from './env';

startServer({ port: env.PORT, debug: env.DEBUG });
// env.API_KEY → string
// env.PORT    → number
// env.DEBUG   → boolean
// env.UNDECLARED → TypeScript error
```

Validation throws before the importing module can use invalid configuration. Missing optional strings become `""` and appear in `envWarnings`; declare only options the app actually uses.

Keep this environment module on the server when it contains secrets. Browser configuration needs its own schema containing only public values.

### Validate locally and in CI

The package includes a CLI; no custom validation script is needed. It requires Node 22.18+, 23.6+, or 24+. The core remains independent of Node.

```sh
# After direnv supplies your local values:
npx @ma.vu/env check --schema ./src/env.schema.ts
```

In CI, run after `npm ci`, with values supplied by the runner or an explicit JSON source:

```yaml
- name: Validate deployment configuration
  env:
    CI_CONFIG: ${{ toJSON(secrets) }}
  run: npx @ma.vu/env check --schema ./src/env.schema.ts --source-env CI_CONFIG
```

The CLI imports the schema, validates it, and exits nonzero on failure. JSON must contain string values; it is never interpolated into the shell command. Without `--source-env`, the CLI validates `process.env`. Neither mode loads `.env` files.

Make validation part of your build script (`mavu-env check --schema ./src/env.schema.ts && your-build-command`) and require the CI job before deployment. The application still parses its actual environment on startup. Type-safe access cannot prevent other modules reading raw environment values; enforce that boundary with lint.

### Export validated configuration for Docker

For deployment systems that need a file, the separate CLI exporter handles validation and serialization:

```sh
npx @ma.vu/env export \
  --schema ./apps/web/src/env.schema.ts \
  --schema ./apps/jobs/src/env.schema.ts \
  --source-env CI_CONFIG \
  --format docker-env \
  --output .env.deploy && \
  docker run --env-file .env.deploy "$IMAGE"
```

Repeat `--schema` for multiple apps. Export includes only schema keys and rejects conflicting parsed values and unsafe numeric integers. Use string schemas for exact IDs and large integers. The file uses Docker's literal format: **do not source it as a shell script** or assume it is interchangeable with Compose's interpolated `.env`. Export is a CLI operation; the core has no file-writing method.

Read the [local and CI workflow guide](./docs/cli.md) for setup, failure behavior, Docker handoff and TypeScript loading. See [backend, web and React Native examples](./examples/README.md) for each platform's typed `env` boundary.

### Keep raw environment access at the boundary

The library provides typed values; your app's lint rules can enforce where `process.env` is read. For example, add this to an existing ESLint flat configuration:

```js
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/env.ts'],
  rules: {
    'no-restricted-properties': ['error', {
      object: 'process',
      property: 'env',
      message: 'Import env from the application environment module.',
    }],
  },
}
```

## API

### Primitives

| Export     | Type    | Behavior                                       |
|------------|---------|-------------------------------------------------|
| `required` | string  | Trimmed, must be non-empty (min length 1)      |
| `optional` | string  | Trimmed, defaults to `""`, appears in warnings if missing |
| `number`   | number  | Coerced via `Number()`, must be finite            |
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

- **`parse(source)`** — validates a string-valued object against the schema. Throws `EnvValidationError` on invalid input, warns on missing optional. Returns `{ data, warnings }`. Ignores undeclared keys and inherited properties; rejects non-string values and null bytes.
- **`keys`** — frozen, readonly array of all schema keys. Names must match `[A-Za-z_][A-Za-z0-9_]*`. The schema key-to-descriptor mapping is copied when `createEnv()` is called.

## Releasing

For the automatic version PR and npm publishing flow, see [Releasing](./RELEASING.md).

## License

MIT
