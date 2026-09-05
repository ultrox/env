# Local validation, CI and Docker

Install `@ma.vu/env` in your project and commit the lockfile. The package provides the `mavu-env` executable, also available through `npx @ma.vu/env`. Use the installed executable in package scripts so CI runs the locked version.

The CLI needs Node **22.18+ or 24+**. The core library stays independent of Node and has no runtime dependencies.

## One contract, three validation points

1. Define a schema in a module that only imports `@ma.vu/env` and declares rules.
2. Locally, direnv supplies values; `mavu-env check` validates them before development starts.
3. CI supplies the target environment; the same command fails the job if configuration is invalid. The application's `env.ts` parses its platform's actual inputs again when it initializes.

Other application modules import the typed `env` from `env.ts`. A schema import does not load files or read the environment.

```ts
// src/env.schema.ts
import { createEnv, required, number } from '@ma.vu/env';

export default createEnv({
  API_URL: required,
  TIMEOUT: number.min(1),
});
```

```ts
// src/env.ts (backend)
import schema from './env.schema.ts';
export const { data: env } = schema.parse(process.env);
```

## Local development

Authorize your project's `.envrc` with `direnv allow`. To load a local `.env`, put `dotenv .env` in `.envrc`. Keep `.env` out of Git. Neither the core nor CLI automatically reads it.

```sh
npx @ma.vu/env check --schema ./src/env.schema.ts
```

Connect validation to the command people actually run. For example, use the [public Vite schema](../examples/web/env.schema.ts) in a Vite application and add to its `package.json`:

```json
{
  "scripts": {
    "env:check": "mavu-env check --schema ./src/env.schema.ts",
    "dev": "npm run env:check && vite",
    "build": "npm run env:check && vite build"
  }
}
```

Use your backend or native build command in place of `vite build`. Validation runs in a separate process: it checks values but does not modify the parent shell. The app's environment module performs the coercion into its typed object.

## CI with runner-supplied variables

Run after checkout, Node setup and `npm ci`. Put the target values on the job so validation and the build consume the same inputs:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      API_URL: ${{ vars.API_URL }}
      TIMEOUT: ${{ vars.TIMEOUT }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build # env:check && your build command
```

Map private server values from `secrets` when needed. Validate deployment secrets in a job that can access the target environment's secrets; fork PR jobs usually cannot. Never silently skip validation when required secrets are unavailable.

A missing required key produces a failure such as:

```text
Schema 1: Invalid environment variables:
API_URL: required
TIMEOUT: expected number (finite)
```

Make this job a required repository check. Deployment must follow a successful validation step, or depend on its job with `needs`. Do not use `continue-on-error` or `|| true`. A library cannot make CI fail if its validation command is never invoked.

## CI with a JSON secret source

When the platform supplies one JSON object, pass it through a step environment variable:

```yaml
- name: Validate deployment configuration
  env:
    CI_CONFIG: ${{ toJSON(secrets) }}
  run: npx @ma.vu/env check --schema ./src/env.schema.ts --source-env CI_CONFIG
```

`--source-env CI_CONFIG` means “read JSON from the environment variable named CI_CONFIG.” The object must have string values. Only this object is validated; it is not merged with `process.env`, and it is not injected into later steps. GitHub's `secrets` object does not include `vars`; use the explicit mapping above when configuration spans both.

Keep JSON out of shell arguments: do not put `${{ toJSON(secrets) }}` directly into a `run` script. Quotes inside a value must remain data. The CLI reports keys and constraints without printing values or JSON parser excerpts. Schema modules execute as code, so keep them free of logging and other side effects.

## Multiple applications

Repeat `--schema`. Each schema validates independently, and failures from every schema are reported:

```sh
npx @ma.vu/env check \
  --schema ./apps/web/src/server/env.schema.ts \
  --schema ./apps/jobs/src/env.schema.ts \
  --source-env CI_CONFIG
```

Prefer a default schema export. A single named schema (`env`, `envSchema`, or another name) also works. If a module exports multiple schemas, select one explicitly:

```sh
npx @ma.vu/env check --schema './config/schemas.ts#web'
```

Imports resolve from the schema module; schema paths resolve from the current working directory. The CLI imports schemas, not the app's initialized `env.ts`.

## Generate Docker's env file

The `export` command includes validation. Replace a custom JSON parsing, schema merging and file-writing script with:

```yaml
- name: Validate and export deployment configuration
  env:
    CI_CONFIG: ${{ toJSON(secrets) }}
  run: |
    npx @ma.vu/env export \
      --schema ./apps/web/src/server/env.schema.ts \
      --schema ./apps/job-server/src/env.schema.ts \
      --source-env CI_CONFIG \
      --format docker-env \
      --output .env.deploy

- name: Smoke test image
  run: |
    docker run --detach --rm \
      --name app-smoke \
      --env-file .env.deploy \
      --publish 127.0.0.1:3900:3000 \
      "$WEB_IMAGE"
    trap 'docker rm --force app-smoke >/dev/null 2>&1 || true' EXIT
    # Keep your application's readiness and HTTP assertions here.

- name: Remove deployment env file
  if: always()
  run: rm -f .env.deploy
```

Set `WEB_IMAGE` in the job and retain the application's existing smoke assertions and deployment steps before cleanup. This example shows configuration handoff; starting a container alone is not a readiness assertion. Pass the same validated file to the deployment that was tested. Docker supplies its entries as container environment variables; the server's `schema.parse(process.env)` validates them on startup.

The exporter:

- Writes only schema keys, using parsed values: numbers and booleans are normalized, optional empty strings remain `KEY=`. Unknown source keys are excluded.
- Combines matching shared keys. If schemas return different types or values for a shared key, export fails; export separate files for those applications.
- Writes raw `KEY=value` lines. Docker treats quotes, dollar signs, `#`, equals signs and backslashes as literal value characters. It does not use shell escaping. See [Docker's env-file parser](https://github.com/docker/cli/blob/master/pkg/kvfile/kvfile.go).
- Rejects values that cannot be represented: embedded CR/LF, null bytes, invalid Unicode or lines of 64 KiB or more. Schema string trimming still applies before export.
- Creates output with owner-only permissions on POSIX and atomically replaces it after successful validation. The destination directory must exist. Failure leaves any existing output untouched; always stop deployment on failure.

This format is for **`docker run --env-file`**. Do not `source .env.deploy` or `. ./.env.deploy` in a shell. Do not assume Docker Compose's interpolating `.env` format has the same semantics. If an existing deployment sources the file or feeds it to a different parser, adjust that consumer before adopting this exporter.

Keep generated files out of Git and public artifacts. There is no `writeEnvFile` method on the core API; serialization belongs to this explicit CLI command.

## TypeScript loading

Simple `.ts` / `.mts` schema modules work with [Node's native TypeScript support](https://nodejs.org/api/typescript.html). Use `import type` for types and real extensions in relative imports. Native loading does not implement tsconfig path aliases, JSX or TypeScript syntax requiring code generation. JavaScript schema modules also work.

If your schema's imports require full TypeScript resolution, install `tsx` as a project dev dependency and opt into its loader:

```sh
npm install --save-dev tsx
NODE_OPTIONS='--import tsx' npx @ma.vu/env check --schema ./src/env.schema.ts
```

This loads TypeScript, not environment files. Keep the schema small and independent of app initialization to avoid needing platform-specific loaders in CI.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All schemas passed; export output was written if requested. |
| `1` | Invalid source/configuration, schema load failure, export conflict or output failure. |
| `2` | Invalid command or options. |

Use `npx @ma.vu/env --help` for the option reference. See [platform examples](../examples/README.md) for backend, Vite and React Native boundaries.
