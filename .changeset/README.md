# Changesets

Every consumer-visible pull request should include a changeset. Run `npm run changeset`, choose the
SemVer impact, and write the release note in terms of what changes for package users.

Changeset files are intentionally committed with the implementation. The release workflow gathers
them into a reviewed version pull request, updates `CHANGELOG.md`, and publishes only after that
pull request is merged.

Documentation, tests, refactors, and build-only changes may omit a changeset when they do not alter
the package consumers install.
