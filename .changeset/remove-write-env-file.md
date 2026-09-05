---
"@ma.vu/env": major
---

Remove `writeEnvFile` and the exported `WriteEnvFileOptions` type. The library now focuses on environment validation and typed access, with no filesystem dependency or file serialization API.

This is a breaking API change. Replace calls to `envSchema.writeEnvFile(...)` with `envSchema.parse(source)` to validate an already supplied environment. The return value remains `{ data, warnings }`; export `data` as the application's typed `env` object. Environment loading and any file generation belong to direnv, the CI runner, or the deployment platform.

Local development and CI use the same validation command. File-writing tests, examples, and the CI installation of direnv used by those tests have been removed.
