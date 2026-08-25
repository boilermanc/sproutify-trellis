const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/i;
const DEFAULT_DENY = [
  /(^|\/)\.env(?:\.|$)/i, /(^|\/)(?:secrets?|credentials?)(?:\/|\.|$)/i,
  /\.(?:pem|key|p12|pfx|jks)$/i, /(^|\/)\.git\//i, /(^|\/)node_modules\//i,
  /auth.*(?:fixture|state|storage)/i, /(?:fixture|seed).*(?:user|customer|account)/i,
];
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.sql', '.yml', '.yaml']);
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff', '.woff2', '.ttf']);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 400;

export interface GitHubEvidenceInput {
  repository: string;
  ref: string;
  permitted_paths: string[];
  prohibited_paths?: string[];
}

export interface ProductEvidenceMap {
  repository: string;
  commit_sha: string;
  framework: string | null;
  permitted_paths: string[];
  scanned_files: Array<{ path: string; sha: string; size: number }>;
  routes: Array<{ id: string; path: string; label: string | null; evidence: Array<{ path: string; lines: [number, number] }>; capture_readiness: 'candidate' }>;
  test_selectors: Array<{ selector: string; evidence: { path: string; line: number } }>;
  assets: Array<{ path: string; kind: 'brand_asset_candidate' }>;
  feature_modules: Array<{ id: string; name: string; evidence: Array<{ path: string; symbol: string | null }> }>;
  skipped: Array<{ path: string; reason: string }>;
}

function clean(value: unknown, max = 500) { return String(value || '').trim().slice(0, max); }
function extension(path: string) { const match = path.toLowerCase().match(/\.[a-z0-9]+$/); return match?.[0] || ''; }
function normalizePath(path: string) { return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/'); }
function pathWithin(path: string, root: string) { return path === root || path.startsWith(`${root}/`); }
function routeId(path: string) { return path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'; }

export function validateGitHubEvidenceInput(value: GitHubEvidenceInput): GitHubEvidenceInput {
  const repository = clean(value?.repository, 200);
  const ref = clean(value?.ref, 200);
  const permitted = Array.isArray(value?.permitted_paths) ? [...new Set(value.permitted_paths.map(normalizePath).filter(Boolean))] : [];
  const prohibited = Array.isArray(value?.prohibited_paths) ? [...new Set(value.prohibited_paths.map(normalizePath).filter(Boolean))] : [];
  if (!REPOSITORY.test(repository)) throw new Error('GitHub repository must use owner/name.');
  if (!ref) throw new Error('A GitHub branch, tag, or commit is required.');
  if (!permitted.length || permitted.length > 30) throw new Error('Choose between 1 and 30 permitted repository paths.');
  if (permitted.some(path => path === '.' || path.startsWith('/') || path.includes('..'))) throw new Error('Permitted paths must be bounded repository-relative paths.');
  return { repository, ref, permitted_paths: permitted, prohibited_paths: prohibited };
}

export function repositoryPathDecision(pathValue: string, input: GitHubEvidenceInput) {
  const path = normalizePath(pathValue);
  if (!input.permitted_paths.some(root => pathWithin(path, root))) return { allowed: false, reason: 'outside_permitted_paths' };
  if ((input.prohibited_paths || []).some(root => pathWithin(path, root))) return { allowed: false, reason: 'explicitly_prohibited' };
  if (DEFAULT_DENY.some(pattern => pattern.test(path))) return { allowed: false, reason: 'secret_or_sensitive_path' };
  const ext = extension(path);
  if (!TEXT_EXTENSIONS.has(ext) && !ASSET_EXTENSIONS.has(ext)) return { allowed: false, reason: 'unsupported_file_type' };
  return { allowed: true, reason: null };
}

function linesFor(text: string, index: number): [number, number] {
  const line = text.slice(0, index).split('\n').length;
  return [line, line];
}

function extractTextEvidence(path: string, text: string, map: ProductEvidenceMap) {
  if (path.endsWith('package.json')) {
    try {
      const pkg = JSON.parse(text);
      const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
      map.framework = dependencies.vite && dependencies.react ? 'React/Vite' : dependencies.next ? 'Next.js' : map.framework;
    } catch { /* inventory remains useful when package JSON is malformed */ }
  }
  const routePatterns = [/\bpath\s*[:=]\s*["'`]([^"'`]+)["'`]/g, /<Route[^>]+path=["'`]([^"'`]+)["'`]/g];
  for (const pattern of routePatterns) for (const match of text.matchAll(pattern)) {
    const route = match[1];
    if (!route.startsWith('/') || route.includes('*') || map.routes.some(item => item.path === route)) continue;
    map.routes.push({ id: routeId(route), path: route, label: null, evidence: [{ path, lines: linesFor(text, match.index || 0) }], capture_readiness: 'candidate' });
  }
  for (const match of text.matchAll(/data-testid=["'`]([^"'`]+)["'`]/g)) {
    const selector = `[data-testid="${match[1]}"]`;
    if (!map.test_selectors.some(item => item.selector === selector)) map.test_selectors.push({ selector, evidence: { path, line: linesFor(text, match.index || 0)[0] } });
  }
  if (/\/(?:pages|features|components)\//i.test(`/${path}`) && /export\s+(?:default\s+)?(?:function|const|class)/.test(text)) {
    const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
    map.feature_modules.push({ id: name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), name, evidence: [{ path, symbol: name }] });
  }
}

export async function buildGitHubEvidenceMap(inputValue: GitHubEvidenceInput, options: {
  token?: string;
  fetcher?: typeof fetch;
} = {}): Promise<ProductEvidenceMap> {
  const input = validateGitHubEvidenceInput(inputValue);
  const fetcher = options.fetcher || fetch;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const api = async (path: string) => {
    const response = await fetcher(`https://api.github.com/repos/${input.repository}${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub evidence request failed (${response.status}).`);
    return response.json();
  };
  const commit = await api(`/commits/${encodeURIComponent(input.ref)}`);
  const commitSha = clean(commit?.sha, 40);
  if (!SHA.test(commitSha)) throw new Error('GitHub did not return a pinned commit SHA.');
  const tree = await api(`/git/trees/${commitSha}?recursive=1`);
  if (tree?.truncated) throw new Error('Repository tree is too large for a bounded evidence scan; choose narrower permitted paths.');
  const map: ProductEvidenceMap = { repository: input.repository, commit_sha: commitSha, framework: null, permitted_paths: input.permitted_paths, scanned_files: [], routes: [], test_selectors: [], assets: [], feature_modules: [], skipped: [] };
  const candidates = (Array.isArray(tree?.tree) ? tree.tree : []).filter((item: any) => item?.type === 'blob').slice(0, 20_000);
  for (const item of candidates) {
    const path = normalizePath(clean(item.path, 1000));
    const decision = repositoryPathDecision(path, input);
    if (!decision.allowed) { if (input.permitted_paths.some(root => pathWithin(path, root))) map.skipped.push({ path, reason: decision.reason! }); continue; }
    const size = Number(item.size || 0);
    if (size > MAX_FILE_BYTES) { map.skipped.push({ path, reason: 'file_too_large' }); continue; }
    if (map.scanned_files.length >= MAX_FILES) throw new Error('Bounded evidence scan exceeded 400 approved files; narrow permitted paths.');
    map.scanned_files.push({ path, sha: clean(item.sha, 64), size });
    if (ASSET_EXTENSIONS.has(extension(path))) { map.assets.push({ path, kind: 'brand_asset_candidate' }); continue; }
    const blob = await api(`/git/blobs/${item.sha}`);
    if (blob?.encoding !== 'base64' || typeof blob?.content !== 'string') { map.skipped.push({ path, reason: 'unsupported_blob_encoding' }); continue; }
    const text = new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\s/g, '')), char => char.charCodeAt(0)));
    extractTextEvidence(path, text, map);
  }
  return map;
}
