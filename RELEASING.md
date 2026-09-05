# Releasing

This package follows the same Changesets release flow as `@ma.vu/app-money`, using npm and `package-lock.json`.

1. Record each consumer-visible change with `npm run changeset` and commit the generated changeset with the implementation.
2. On a push to `main`, `.github/workflows/release.yml` creates or updates a `chore: release @ma.vu/env` pull request containing the new version, lockfile, and changelog.
3. Merge that version pull request to publish to npm, push the matching git tag, and create a GitHub Release. `workflow_dispatch` can retry the flow on `main`.

The workflow uses the same pinned Changesets actions as app-money, separate version/publish permissions, and a serialized release concurrency group. `prepublishOnly` runs type checking, the tests, and a fresh build before publication.

## Repository and npm setup

GitHub Actions must be allowed to create pull requests. The publish job uses the GitHub environment `npm`.

Configure the [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) for the existing `@ma.vu/env` package with:

- GitHub owner: `ultrox`
- Repository: `env`
- Workflow filename: `release.yml`
- Environment: `npm`

The publish job uses a GitHub-hosted runner, Node 24, npm 12.0.2, and `id-token: write`. With the trusted publisher configured, npm authenticates with OIDC and attaches provenance automatically.

Like app-money, the workflow accepts an optional `NPM_TOKEN` environment secret as a setup fallback. Once OIDC works, remove that secret and revoke its token. Do not copy package-scoped tokens from another repository.

## Version baseline

npm already contains `@ma.vu/env@0.3.0`. The package and lockfile use that published version as the baseline; the pending minor changeset proposes `0.4.0`. Run `npm exec changeset status` to inspect the release plan. `npm run version-packages` is the version PR command and updates the npm lockfile after applying changesets.
