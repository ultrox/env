---
"@ma.vu/env": minor
---

Validate configuration consistently in local development and CI, with one typed application environment export.

- Remove `writeEnvFile` and `WriteEnvFileOptions`. The library now focuses on schema validation and typed access; environment loading and file management belong to the shell or deployment platform.
- Remove input values from validation errors.
- Reject non-string inputs, null bytes, infinite numbers, and invalid environment variable names. Ignore inherited source properties.
- Copy the schema mapping and expose a frozen, readonly key list so the schema stays consistent.
- Document explicit direnv loading, the shared local/CI validation command, and typed access through one `env` module.

Compatibility notes: `writeEnvFile` and `WriteEnvFileOptions` are removed. Consumers must supply environment values and call `parse(source)` directly. Validation errors now start with `Invalid environment variables`. Code mutating `env.keys` must stop doing so.
