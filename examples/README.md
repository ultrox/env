# Use the same schema across platforms

Copy the relevant `env.schema.ts` and `env.ts` into your application's source directory. Install `@ma.vu/env`, and have the rest of the application import `env` from that one module. These are integration examples, not complete applications.

Run the CLI with Node 22.18+ or 24+, regardless of the application's runtime. The validation core has no Node imports or runtime dependencies.

## Backend

[Schema](./backend/env.schema.ts) · [environment module](./backend/env.ts)

The server reads `process.env` once through `schema.parse(process.env)`. `env.PORT` is a number; `env.DEBUG` is a boolean. A required key missing at startup throws before the importing server module proceeds.

After direnv or CI supplies `DATABASE_URL`, `PORT` and optional `DEBUG`:

```sh
npx @ma.vu/env check --schema ./src/env.schema.ts
```

Run this before development/build/deployment, and import the environment module during server startup. If a platform already injects environment variables, it needs no exported file.

## Web: Vite / React

[Public schema](./web/env.schema.ts) · [environment module](./web/env.ts)

The CLI validates `VITE_API_URL` and `VITE_TIMEOUT` from the build environment. The application's environment module maps the same keys explicitly from `import.meta.env`, then parses them into typed values. `env.VITE_TIMEOUT` is a number.

```json
{
  "scripts": {
    "env:check": "mavu-env check --schema ./src/env.schema.ts",
    "dev": "npm run env:check && vite",
    "build": "npm run env:check && vite build"
  }
}
```

Use your Vite project's existing `vite/client` types. The sample `.ts` relative imports require `allowImportingTsExtensions` with `noEmit`, as commonly used in bundler projects.

For a direnv-only setup, set `envDir: false` in `vite.config.ts` to disable Vite's env-file loading. Keep the same supplied values available to both validation and build. See [Vite's envDir option](https://vite.dev/config/shared-options#envdir).

Vite embeds public values during the build. Changing the deployment server's environment later does not change that bundle; rebuild with the intended configuration. Keep server secrets in a separate server-only schema. See [Vite environment variables](https://vite.dev/guide/env-and-mode).

## React Native: Expo

[Public schema](./react-native/env.schema.ts) · [environment module](./react-native/env.ts)

CI checks `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_TIMEOUT` before Metro bundles the app. Only `env.ts` reads `process.env.EXPO_PUBLIC_*`, using literal property accesses so Expo can inline them. Do not replace that mapping with a loop over schema keys or destructuring of `process.env`.

```json
{
  "scripts": {
    "env:check": "mavu-env check --schema ./src/env.schema.ts",
    "start": "npm run env:check && expo start",
    "bundle": "npm run env:check && expo export"
  }
}
```

Supply the public values and `EXPO_NO_DOTENV=1` through direnv locally and through the actual build job in CI. This disables Expo's automatic env-file loading while preserving variable inlining. Keep inline `process.env.EXPO_PUBLIC_*` reads in application source, because Expo does not transform dependency code in `node_modules`. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

For remote builds, run the check in the environment that actually bundles the app, with the same target values. A successful check on a developer machine does not validate a separately configured remote build.

These values are public in the shipped application. Keep credentials on the backend. For React Native without Expo, have your existing native configuration mechanism supply a string-valued object to `schema.parse(source)` in `env.ts`; there is no assumption that a Node `process.env` exists on the device. CI must receive the same keys and values that mechanism will embed.

## Enforce one access point

Add a rule to your existing ESLint flat configuration and run lint in CI:

```js
{
  files: ['src/**/*.{js,jsx,ts,tsx}'],
  ignores: ['src/env.ts'],
  rules: {
    'no-restricted-properties': ['error', {
      object: 'process',
      property: 'env',
      message: 'Import env from src/env instead.',
    }],
    'no-restricted-syntax': ['error', {
      selector: "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='env']",
      message: 'Import env from src/env instead.',
    }],
  },
}
```

This catches ordinary direct `process.env` and `import.meta.env` access outside the boundary. It is a lint convention, not a security boundary against deliberately aliased access. Restrict imports of any native configuration binding similarly in projects using one.

See the [workflow guide](../docs/cli.md) for CI failure behavior, multiple schemas and Docker export.
