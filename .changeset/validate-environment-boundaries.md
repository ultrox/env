---
"@ma.vu/env": minor
---

Validate configuration consistently in local development and CI, with one typed application environment export.

- Quote generated dotenv values and add `format: "shell"` for safely sourced export assignments. Values that dotenv readers cannot preserve consistently now fail before writing; shell format supports those values.
- Remove input values from validation errors and malformed-JSON errors.
- Reject non-string inputs, null bytes, infinite numbers, and invalid environment variable names. Ignore inherited source properties.
- Copy the schema mapping and expose a frozen, readonly key list so validation and file generation stay consistent.
- Document explicit direnv loading, the shared local/CI schema, typed access through one `env` module, and safe GitHub Actions JSON transport.

Compatibility notes: validation errors now start with `Invalid environment variables`. Code mutating `env.keys` must stop doing so. Consumers sourcing generated files must request `format: "shell"`; dotenv and shell files are different formats.
