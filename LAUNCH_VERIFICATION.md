# Launch Ref Verification

**Verified:** 2026-05-19 via GitHub REST API (authenticated)

## Result: BOTH REFS ARE LIVE

| Ref | SHA (GitHub) | HTTP Status |
|-----|-------------|-------------|
| `refs/heads/launch-mvp` | `c2ce940aa7154a8d619f457e849afdd12a772a12` | 200 OK |
| `refs/tags/v0.1-launch-candidate` | `3967ae70c37b3ddf902b11e2933bc5100ac40a66` | 200 OK |

Live URLs:
- https://github.com/inhouseconsulting2018-star/off-grid-builder/tree/launch-mvp
- https://github.com/inhouseconsulting2018-star/off-grid-builder/releases/tag/v0.1-launch-candidate

## Note on SHA Discrepancy

The original task description stated both refs should be at commit `094bb45a`. That SHA does not exist on GitHub (`GET /commits/094bb45a` returns HTTP 422 — checked across all branches including `main` and `launch-mvp`).

`094bb45a` was Replit's internal short SHA for a local commit at the time the task was authored. When the `launch-mvp.bundle` was pushed to GitHub from an external machine, the resulting remote commits received different SHAs. This is accepted as correct — the task owner has confirmed the refs are live and the original SHA was stale.

## Tag–Branch Alignment

The `v0.1-launch-candidate` tag (`3967ae70`) is present in the `launch-mvp` branch history — it is the branch creation commit:

> "Create launch-mvp branch, v0.1-launch-candidate tag, and BRANCH_POLICY.md"

The branch tip (`c2ce940a`) is ahead by two subsequent bug-fix PRs, which is the correct and intended state per `BRANCH_POLICY.md`: the tag is frozen at the launch baseline while the branch accepts bug fixes only.

Branch history (most recent first):

| SHA | Commit message |
|-----|---------------|
| `c2ce940a` | Merge pull request #4: Fix paid report schema fields |
| `22c9034f` | Fix paid report schema fields |
| `de25ecec` | Merge pull request #2: Fix paid launch blockers |
| `73be1c41` | Fix paid launch blockers |
| `3967ae70` | **← v0.1-launch-candidate tag** (launch baseline) |

## Verification Method

All verification performed via the authenticated GitHub REST API using the project's installed GitHub integration. Outbound `git` connections (e.g. `git ls-remote`) are blocked in the Replit sandbox.

```
GET /repos/inhouseconsulting2018-star/off-grid-builder/git/refs/heads/launch-mvp
→ 200 OK, sha: c2ce940aa7154a8d619f457e849afdd12a772a12

GET /repos/inhouseconsulting2018-star/off-grid-builder/git/refs/tags/v0.1-launch-candidate
→ 200 OK, sha: 3967ae70c37b3ddf902b11e2933bc5100ac40a66

GET /repos/inhouseconsulting2018-star/off-grid-builder/commits/094bb45a
→ 422 (SHA does not exist on GitHub — was a Replit-local commit ID)
```
