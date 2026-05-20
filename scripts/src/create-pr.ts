/**
 * Creates the paid-launch-final-polish branch from launch-mvp and opens a PR.
 * Obtains GitHub token via the Replit connectors proxy.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run create-pr
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OWNER = 'inhouseconsulting2018-star';
const REPO  = 'off-grid-builder';
const BASE_BRANCH  = 'launch-mvp';
const HEAD_BRANCH  = 'paid-launch-final-polish';

const WORKSPACE_ROOT = resolve(__dirname, '../../..');

async function getGitHubToken(): Promise<string> {
  // 1. Prefer an explicit GITHUB_TOKEN secret (a GitHub PAT with `repo` scope)
  const explicit = process.env['GITHUB_TOKEN'];
  if (explicit) {
    console.log('✓ Using GITHUB_TOKEN from environment');
    return explicit;
  }

  // 2. Fall back to the Replit connectors proxy
  const hostname = process.env['REPLIT_CONNECTORS_HOSTNAME'];
  const identity = process.env['REPL_IDENTITY'];
  const webRenewal = process.env['WEB_REPL_RENEWAL'];

  if (hostname) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (identity) headers['X-Replit-Token'] = `repl ${identity}`;
    else if (webRenewal) headers['X-Replit-Token'] = `depl ${webRenewal}`;

    if (headers['X-Replit-Token']) {
      for (const env of ['development', 'production']) {
        const url = new URL(`https://${hostname}/api/v2/connection`);
        url.searchParams.set('include_secrets', 'true');
        url.searchParams.set('connector_names', 'github');
        url.searchParams.set('environment', env);

        try {
          const resp = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8_000) });
          if (!resp.ok) continue;
          const data = await resp.json() as { items?: Array<{ settings?: { token?: string } }> };
          const token = data.items?.[0]?.settings?.token;
          if (token && token.length > 10) {
            console.log(`✓ Got GitHub token from connectors (${env})`);
            return token;
          }
        } catch { /* try next */ }
      }
    }
  }

  throw new Error(
    'No GitHub token found.\n\n' +
    'Add a GITHUB_TOKEN secret in Replit Secrets:\n' +
    '  1. Go to github.com/settings/tokens → Generate new token (classic)\n' +
    '  2. Select scope: repo\n' +
    '  3. Add it as GITHUB_TOKEN in Replit Secrets\n' +
    '  4. Re-run: pnpm --filter @workspace/scripts run create-pr'
  );
}

async function ghFetch(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  return resp;
}

async function getRefSha(token: string, branch: string): Promise<string> {
  const resp = await ghFetch(token, `/git/refs/heads/${branch}`);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Could not get ref for ${branch}: ${resp.status} ${body}`);
  }
  const data = await resp.json() as { object: { sha: string } };
  return data.object.sha;
}

async function createBranch(token: string, sha: string): Promise<void> {
  const resp = await ghFetch(token, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${HEAD_BRANCH}`, sha }),
  });
  if (resp.status === 422) {
    console.log(`Branch ${HEAD_BRANCH} already exists, proceeding.`);
    return;
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to create branch: ${resp.status} ${body}`);
  }
  console.log(`✓ Created branch: ${HEAD_BRANCH}`);
}

async function getFileSha(token: string, path: string, ref: string): Promise<string | null> {
  const resp = await ghFetch(token, `/contents/${encodeURIComponent(path)}?ref=${ref}`);
  if (resp.status === 404) return null;
  if (!resp.ok) return null;
  const data = await resp.json() as { sha?: string };
  return data.sha ?? null;
}

async function upsertFile(token: string, filePath: string, message: string): Promise<void> {
  const localPath = resolve(WORKSPACE_ROOT, filePath);
  const content = readFileSync(localPath, 'utf-8');
  const encoded = Buffer.from(content).toString('base64');

  const existingSha = await getFileSha(token, filePath, HEAD_BRANCH);

  const body: Record<string, unknown> = {
    message,
    content: encoded,
    branch: HEAD_BRANCH,
  };
  if (existingSha) body['sha'] = existingSha;

  const resp = await ghFetch(token, `/contents/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to push ${filePath}: ${resp.status} ${text}`);
  }
  console.log(`  ✓ ${filePath}`);
}

async function createPr(token: string): Promise<string> {
  const resp = await ghFetch(token, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: 'fix: tighten paywall gates, fix unpaid preview spinner, production polish',
      body: [
        '## Changes in this PR',
        '',
        '### 1. Fix infinite loading spinner for unpaid projects (core bug)',
        '`GET /projects/:id` for unpaid users now returns a lightweight `calculationResult`',
        'preview object (basic sizing + PVWatts monthly data) instead of `null`.',
        'Previously the results page showed a loading spinner forever because `calculationResult`',
        'was stripped to `null` on re-fetch, so the loading condition `!project.calculationResult`',
        'never resolved.',
        '',
        '### 2. Tighten paywall gates on the results page',
        'These sections are now hidden for unpaid users (previously exposed or broken):',
        '- **Cost Estimate** — dollar amounts, yearly savings, payback period',
        '- **System Loss Breakdown** — inverter/wire/shade/temp/battery loss %',
        '- **Battery System Guide** — detailed sizing & placement guide',
        '- **Design Notes** — engineering-level design notes',
        '- **Equipment Recommendations Summary** — brand name recommendations',
        '- **Engineering Flags** — calc engine warnings',
        '',
        'Free preview shows: System Summary (array size, battery kWh, inverter kW),',
        'Monthly Production Chart (PVWatts data), and Project Map.',
        '',
        '### 3. Remove "test mode" hint from paywall UI',
        '`"test mode active (use card 4242...)"` replaced with neutral production-safe copy.',
        '',
        '### 4. Live Stripe seed script',
        '`scripts/src/seed-stripe-live.ts` + `pnpm --filter @workspace/scripts run seed-stripe-live`',
        '',
        '### 5. Production setup documentation',
        '`PRODUCTION_SETUP.md` — required env vars, live Stripe setup steps, webhook registration,',
        'admin API reference, and a pre-launch checklist.',
        '',
        '---',
        '_No live Stripe keys. No DB migrations. Safe to merge to `launch-mvp`._',
      ].join('\n'),
      head: HEAD_BRANCH,
      base: BASE_BRANCH,
      draft: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create PR: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { html_url: string; number: number };
  console.log(`✓ PR #${data.number} created`);
  return data.html_url;
}

async function main() {
  console.log('Obtaining GitHub token...');
  const token = await getGitHubToken();

  console.log(`\nGetting ${BASE_BRANCH} SHA...`);
  const sha = await getRefSha(token, BASE_BRANCH);
  console.log(`✓ ${BASE_BRANCH} @ ${sha}`);

  console.log(`\nCreating branch: ${HEAD_BRANCH} (from ${BASE_BRANCH})`);
  await createBranch(token, sha);

  console.log('\nPushing changed files:');
  const files = [
    { path: 'artifacts/api-server/src/middlewares/auth.ts',       message: 'fix(api): return basic sizing preview for unpaid projects instead of null' },
    { path: 'artifacts/offgrid-solar/src/pages/results.tsx',      message: 'fix(ui): tighten paywall gates, remove test mode hint, fix loading spinner' },
    { path: 'scripts/src/seed-stripe-live.ts',                    message: 'feat(scripts): add live Stripe seed script for production setup' },
    { path: 'scripts/package.json',                               message: 'chore(scripts): add seed-stripe-live and create-pr script entries' },
    { path: 'PRODUCTION_SETUP.md',                                message: 'docs: add production setup guide with env vars and Stripe checklist' },
  ];

  for (const file of files) {
    await upsertFile(token, file.path, file.message);
  }

  console.log('\nOpening pull request...');
  const prUrl = await createPr(token);

  console.log(`\n✓ Done!\n  PR: ${prUrl}`);
}

main().catch(err => {
  console.error('\n✗ Error:', err.message);
  process.exit(1);
});
