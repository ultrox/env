# @ma.vu/env

## 1.0.0

### Major Changes

- [#4](https://github.com/ultrox/env/pull/4) [`69e8bce`](https://github.com/ultrox/env/commit/69e8bceaf3925e2b8ab687d72bceb5ce25e7191d) Thanks [@ultrox](https://github.com/ultrox)! - Remove `writeEnvFile` and the exported `WriteEnvFileOptions` type. The library now focuses on environment validation and typed access, with no filesystem dependency or file serialization API.
  
  This is a breaking API change. Replace calls to `envSchema.writeEnvFile(...)` with `envSchema.parse(source)` to validate an already supplied environment. The return value remains `{ data, warnings }`; export `data` as the application's typed `env` object. Environment loading and any file generation belong to direnv, the CI runner, or the deployment platform.
  
  Local development and CI use the same validation command. File-writing tests, examples, and the CI installation of direnv used by those tests have been removed.

## 0.4.0

### Minor Changes

- [`44ee28d`](https://github.com/ultrox/env/commit/44ee28dcafd438a7a80089e8fe6c761ff7af0176) Thanks [@ultrox](https://github.com/ultrox)! - Validate configuration consistently in local development and CI, with one typed application environment export.
  
  - Quote generated dotenv values and add `format: "shell"` for safely sourced export assignments. Values that dotenv readers cannot preserve consistently now fail before writing; shell format supports those values.
  - Remove input values from validation errors and malformed-JSON errors.
  - Reject non-string inputs, null bytes, infinite numbers, and invalid environment variable names. Ignore inherited source properties.
  - Copy the schema mapping and expose a frozen, readonly key list so validation and file generation stay consistent.
  - Document explicit direnv loading, the shared local/CI schema, typed access through one `env` module, and safe GitHub Actions JSON transport.
  
  Compatibility notes: validation errors now start with `Invalid environment variables`. Code mutating `env.keys` must stop doing so. Consumers sourcing generated files must request `format: "shell"`; dotenv and shell files are different formats.
