# CI workflow — one manual step required

`backend-ci.yml` in this directory is a ready-to-use GitHub Actions workflow.
It is parked here because the automation account that produced it does not hold
the `workflows` permission, so it cannot push files into `.github/workflows/`.

## Activate it

```bash
mkdir -p .github/workflows
git mv ci/backend-ci.yml .github/workflows/backend-ci.yml
git commit -m "ci: enable backend CI workflow"
git push
```

Nothing else is needed — it runs on push and pull request for any change under
`12_Backend/`.

## What it checks

| Job | Step | Why it exists |
|---|---|---|
| `verify` | `npm ci` | Installs strictly from the lockfile; fails if it drifts from `package.json`. |
| `verify` | `npm run typecheck` | `tsc --noEmit` under `strict`. |
| `verify` | `npm run lint` | ESLint over `src/` and `test/`. |
| `verify` | `npm test` | 91 tests against a real embedded Postgres, including RLS policies enforced via a `NOBYPASSRLS` role. |
| `verify` | `npm run test:boot` | Boots the real production command and asserts it serves traffic. |
| `docker` | image build | Builds the `runtime` stage of the Dockerfile. |
| `docker` | entrypoint smoke | Asserts the container does not silently exit 0. |

The last two matter most. The test suite imports `buildServer()` directly, so
it cannot detect a broken production entrypoint — precisely the bug that made
`node dist/server.js` a no-op. Without `test:boot`, a green test run can still
mean a container that serves nothing.

Locally, `npm run verify` runs the same gate as the `verify` job.
