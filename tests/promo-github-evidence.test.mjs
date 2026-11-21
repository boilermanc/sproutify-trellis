import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGitHubEvidenceMap, repositoryPathDecision, validateGitHubEvidenceInput } from '../supabase/functions/_shared/github-evidence.ts';

const input = {
  repository: 'crowe/rekkrd', ref: 'main',
  permitted_paths: ['src', 'package.json', 'public'],
  prohibited_paths: ['src/private'],
};

test('path policy is deny-first inside explicit permitted roots', () => {
  const validated = validateGitHubEvidenceInput(input);
  assert.equal(repositoryPathDecision('src/App.tsx', validated).allowed, true);
  assert.equal(repositoryPathDecision('.env.production', validated).allowed, false);
  assert.equal(repositoryPathDecision('src/private/fixture.ts', validated).reason, 'explicitly_prohibited');
  assert.equal(repositoryPathDecision('src/auth-storage-state.json', validated).reason, 'secret_or_sensitive_path');
  assert.equal(repositoryPathDecision('README.md', validated).reason, 'outside_permitted_paths');
  assert.equal(repositoryPathDecision('src/photo.exe', validated).reason, 'unsupported_file_type');
});

test('bounded GitHub scan pins commit and never fetches prohibited blobs', async () => {
  const requested = [];
  const text = value => btoa(value);
  const responses = new Map([
    ['/commits/main', { sha: 'a'.repeat(40) }],
    [`/git/trees/${'a'.repeat(40)}?recursive=1`, { tree: [
      { type: 'blob', path: 'package.json', sha: '1'.repeat(40), size: 80 },
      { type: 'blob', path: 'src/routes.tsx', sha: '2'.repeat(40), size: 180 },
      { type: 'blob', path: 'src/private/credentials.ts', sha: '3'.repeat(40), size: 40 },
      { type: 'blob', path: '.env', sha: '4'.repeat(40), size: 40 },
      { type: 'blob', path: 'public/logo.svg', sha: '5'.repeat(40), size: 50 },
    ] }],
    [`/git/blobs/${'1'.repeat(40)}`, { encoding: 'base64', content: text('{"dependencies":{"react":"19","vite":"6"}}') }],
    [`/git/blobs/${'2'.repeat(40)}`, { encoding: 'base64', content: text('export const routes = [{ path: "/listening-room" }];\nexport const ListeningRoom = () => <main data-testid="listening-room" />;') }],
  ]);
  const fetcher = async url => {
    const path = new URL(url).pathname.replace('/repos/crowe/rekkrd', '') + new URL(url).search;
    requested.push(path);
    const payload = responses.get(path);
    return { ok: !!payload, status: payload ? 200 : 404, json: async () => payload };
  };
  const map = await buildGitHubEvidenceMap(input, { fetcher });
  assert.equal(map.commit_sha, 'a'.repeat(40));
  assert.equal(map.framework, 'React/Vite');
  assert.equal(map.routes[0].path, '/listening-room');
  assert.equal(map.test_selectors[0].selector, '[data-testid="listening-room"]');
  assert.deepEqual(map.assets, [{ path: 'public/logo.svg', kind: 'brand_asset_candidate' }]);
  assert.ok(!requested.some(path => path.includes('3'.repeat(40)) || path.includes('4'.repeat(40))));
});

test('whole-repository and parent traversal permissions are rejected', () => {
  assert.throws(() => validateGitHubEvidenceInput({ ...input, permitted_paths: ['.'] }), /bounded/i);
  assert.throws(() => validateGitHubEvidenceInput({ ...input, permitted_paths: ['../other'] }), /repository-relative/i);
});

test('private repository access reports the exact missing server credential', async () => {
  const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    buildGitHubEvidenceMap(input, { fetcher: notFound }),
    /server-side GITHUB_READ_TOKEN/,
  );
  await assert.rejects(
    buildGitHubEvidenceMap(input, { token: 'configured-token', fetcher: notFound }),
    /failed \(404\)/,
  );
});
