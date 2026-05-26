---
name: OffGrid Solar orval hook request options
description: How to pass custom headers (e.g. x-access-token) to orval-generated React Query hooks
---

All orval-generated hooks accept an options object with a `request` field:
```ts
const reqOpts = { headers: { "x-access-token": token } };
const { data } = useGetProject(projectId, { request: reqOpts });
const update = useUpdateProject({ request: reqOpts });
const calc   = useCalculateProject({ request: reqOpts });
```
The generated code destructures `options?.request` and spreads it into the fetch call.
Confirmed at line ~405 in `lib/api-client-react/src/generated/api.ts`.

**Why:** Token must travel on every API call; hooks accept it via `request` not a context.
