import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Creates the GitHub Release for v0.1-launch-candidate.
 *
 * Uses the GitHub API (POST /repos/{owner}/{repo}/releases) via the
 * Replit GitHub connector proxy. Release notes are sourced from
 * releases/v0.1-launch-candidate.md at the repo root.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run create-github-release
 *
 * This script is idempotent — it checks whether the release already exists
 * before attempting to create it. If it does, it prints the existing URL.
 *
 * Requires the GitHub integration to be connected in this Replit workspace.
 * The connector proxy injects the OAuth token automatically.
 */

const OWNER = 'inhouseconsulting2018-star';
const REPO = 'off-grid-builder';
const TAG = 'v0.1-launch-candidate';
const RELEASE_NAME = 'v0.1 — Launch Candidate';

async function githubRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const { ReplitConnectors } = await import('@replit/connectors-sdk');
  const connectors = new ReplitConnectors();
  return connectors.proxy('github', path, options);
}

async function createRelease() {
  const notesPath = resolve(process.cwd(), '../releases/v0.1-launch-candidate.md');
  const body = readFileSync(notesPath, 'utf-8');

  console.log(`Checking if release "${TAG}" already exists...`);

  const checkRes = await githubRequest(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  if (checkRes.status === 200) {
    const existing = await checkRes.json() as { html_url: string };
    console.log(`\n✓ Release already exists: ${existing.html_url}`);
    return;
  }
  if (checkRes.status !== 404) {
    const text = await checkRes.text();
    console.error(`\n✗ Unexpected status ${checkRes.status} while checking for release:\n${text}`);
    process.exit(1);
  }

  console.log('Release not found — creating...');

  const createRes = await githubRequest(`/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: TAG,
      name: RELEASE_NAME,
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await createRes.json() as { html_url?: string; message?: string; errors?: unknown[] };

  if (createRes.status === 201) {
    console.log(`\n✓ Release created: ${data.html_url}`);
  } else {
    console.error(`\n✗ Failed (HTTP ${createRes.status}): ${data.message}`);
    if (data.errors) console.error('Errors:', JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }
}

createRelease().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
