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

In CI and production, have the runner or deployment platform supply the environment before starting the app. Keep the schema reusable so the same rules validate deployment inputs and application configuration. `writeEnvFile()` generates a validated file for an explicit consumer; it does not load that file into `process.env`.

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

### Validate locally

Load local values with direnv as described above. A small command can validate them before starting your dev server or running a build:

```ts
// bin/validate-env.ts
import '../src/env';
```

```sh
npx tsx bin/validate-env.ts && npm run dev
```

### Validate deployment inputs in CI

Reuse the schema without importing the application's runtime environment module:

```ts
// bin/write-env.ts
import { envSchema } from '../src/env.schema';

const source = process.env.ENV_SOURCE_JSON;
const output = process.argv[2];

if (source === undefined || !output) {
  throw new Error('Set ENV_SOURCE_JSON and pass an output path');
}

envSchema.writeEnvFile({ source, output });
```

```yaml
- name: Validate deployment configuration and generate .env
  env:
    ENV_SOURCE_JSON: ${{ toJSON(secrets) }}
  run: npx tsx bin/write-env.ts .env.deploy
```

This example assumes the required deployment values are stored in GitHub Actions secrets. JSON is passed through a step environment variable, so quotes in values never become shell syntax. See [GitHub's guidance on intermediate environment variables](https://docs.github.com/en/actions/reference/security/secure-use#use-an-intermediate-environment-variable).

Validation or serialization errors fail the command before writing the output. Only schema keys are written; empty optional strings are skipped. Errors identify the failing keys and rules without printing their values or the source JSON. Have the deployment platform explicitly load the generated file. For CI jobs that already receive individual environment variables, run the local validation command directly.

### Choose the file's consumer

`writeEnvFile()` defaults to `format: "dotenv"`. It quotes values for dotenv readers such as direnv and Node's environment-file reader. Those readers disagree about some escape sequences, so values that cannot be preserved across them are rejected before writing. This includes carriage returns and some combinations of apostrophes, double quotes, backslashes, dollars, and newlines. Direct `parse()` validation does not impose these file-format restrictions.

For a file that will be sourced by a POSIX shell, select the shell format:

```ts
envSchema.writeEnvFile({
  source,
  output: 'env.deploy.sh',
  format: 'shell',
});
```

```sh
. ./env.deploy.sh
node dist/server.js
```

Shell output contains safely quoted `export` assignments and preserves quotes, dollar signs, backslashes, and newlines without expanding or executing them. It can also be explicitly sourced from a direnv `.envrc`. Use the dotenv format with direnv's `dotenv` helper; shell output and dotenv output are different formats. Docker Compose and `docker run --env-file` have their own parsing rules, so do not assume either file format is interchangeable with them.

New files are created with owner-only permissions. Existing files retain their permissions. Keep generated secret files out of version control and public artifacts.

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

- **`parse(source)`** — validates a string-valued object against the schema. Throws on errors, warns on missing optional. Returns `{ data, warnings }`. Ignores undeclared keys and inherited properties; rejects non-string values and null bytes.
- **`writeEnvFile({ source, output, format? })`** — validates an object or JSON string and writes a file. Format is `"dotenv"` (default) or `"shell"`. Throws on validation or serialization errors before writing.
- **`keys`** — frozen, readonly array of all schema keys. Names must match `[A-Za-z_][A-Za-z0-9_]*`. The schema key-to-descriptor mapping is copied when `createEnv()` is called.

## Releasing

For the automatic version PR and npm publishing flow, see [Releasing](./RELEASING.md).

## License

MIT
