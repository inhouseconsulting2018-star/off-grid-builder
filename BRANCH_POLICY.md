# Branch Policy: launch-mvp

## Purpose

This branch (`launch-mvp`) is the stable launch baseline tagged as `v0.1-launch-candidate`.

## Rules

- **Bug fixes only.** No new features may be merged into this branch.
- All bug fixes must be reviewed before merging.
- Any fix applied here should also be applied to `main` to keep branches in sync.

## Version Tag

This branch is tagged `v0.1-launch-candidate` at the point it was branched from `main`.

## Applying future fixes to GitHub

To publish additional bug fixes from this branch after they have been committed:

```bash
# From any local clone with GitHub credentials:
git fetch origin launch-mvp
git push origin launch-mvp
```

Or trigger the `.github/workflows/push-launch-branch.yml` workflow from GitHub Actions (supports optional `--force`).

Verify the branch at:
- https://github.com/inhouseconsulting2018-star/off-grid-builder/tree/launch-mvp
- https://github.com/inhouseconsulting2018-star/off-grid-builder/releases/tag/v0.1-launch-candidate
