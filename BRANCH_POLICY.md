# Branch Policy: launch-mvp

## Purpose

This branch (`launch-mvp`) is the stable launch baseline tagged as `v0.1-launch-candidate`.

## Rules

- **Bug fixes only.** No new features may be merged into this branch.
- All bug fixes must be reviewed before merging.
- Any fix applied here should also be applied to `main` to keep branches in sync.

## Version Tag

This branch is tagged `v0.1-launch-candidate` at the point it was branched from `main`.

## Branch Protection Status

Branch protection is **active** on `launch-mvp`. The following rules are enforced by GitHub:

- **Pull request required** — all changes must come through a PR with at least 1 approving review; direct pushes to the branch are blocked
- **Force-push disabled** — `git push --force` to `launch-mvp` is rejected
- **Branch deletion disabled** — the branch cannot be deleted via the API or UI

These rules apply to everyone, including repository administrators (`enforce_admins: true`).

The repository was made **public** to enable these protection rules (GitHub requires a Pro account or a public repository for branch protection on private repos under the free plan).

View or modify the rules at:
https://github.com/inhouseconsulting2018-star/off-grid-builder/settings/branches

## Applying future fixes to GitHub

All changes to `launch-mvp` must go through a pull request reviewed by at least one team member. Direct pushes and force-pushes are blocked by GitHub branch protection (see Branch Protection Status above).

**Correct workflow:**
1. Create a feature branch from `launch-mvp` (e.g. `fix/my-bugfix`)
2. Open a pull request targeting `launch-mvp`
3. Get at least one review approval before merging
4. Apply the same fix to `main` to keep branches in sync

**Do not** run `git push --force origin launch-mvp` or push directly to `launch-mvp` without a PR.

Note: The `.github/workflows/push-launch-branch.yml` workflow's optional `--force` flag should not be used on this branch.

Verify the branch at:
- https://github.com/inhouseconsulting2018-star/off-grid-builder/tree/launch-mvp
- https://github.com/inhouseconsulting2018-star/off-grid-builder/releases/tag/v0.1-launch-candidate
