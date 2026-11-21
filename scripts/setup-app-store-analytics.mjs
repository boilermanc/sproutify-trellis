import { readFile } from 'node:fs/promises';
import { createPrivateKey, sign } from 'node:crypto';

const API_ROOT = 'https://api.appstoreconnect.apple.com/v1';

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) {
      throw new Error(`Invalid argument near ${key ?? 'end of command'}`);
    }
    values.set(key.slice(2), value);
  }
  return values;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createToken({ issuerId, keyId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  }));
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

async function appleRequest(token, path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const details = body?.errors?.map((error) => error.detail || error.title).join('; ');
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${details || text}`);
  }
  return body;
}

async function ensureRequest(token, app, accessType) {
  const existing = await appleRequest(
    token,
    `/apps/${app.id}/analyticsReportRequests?filter[accessType]=${accessType}`,
  );
  const active = existing.data?.find((request) => !request.attributes?.stoppedDueToInactivity);
  if (active) {
    return { app: app.name, appId: app.id, accessType, requestId: active.id, created: false };
  }

  const created = await appleRequest(token, '/analyticsReportRequests', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'analyticsReportRequests',
        attributes: { accessType },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      },
    }),
  });
  return { app: app.name, appId: app.id, accessType, requestId: created.data.id, created: true };
}

const args = parseArgs(process.argv.slice(2));
const issuerId = args.get('issuer-id');
const keyId = args.get('key-id');
const privateKeyPath = args.get('private-key');
const appsJson = args.get('apps-json');

if (!issuerId || !keyId || !privateKeyPath || !appsJson) {
  throw new Error('Required: --issuer-id, --key-id, --private-key, and --apps-json');
}

const privateKey = await readFile(privateKeyPath, 'utf8');
const apps = JSON.parse(appsJson);
const token = createToken({ issuerId, keyId, privateKey });
const results = [];

for (const app of apps) {
  for (const accessType of ['ONGOING', 'ONE_TIME_SNAPSHOT']) {
    results.push(await ensureRequest(token, app, accessType));
  }
}

for (const result of results) {
  console.log(`${result.created ? 'created' : 'existing'}\t${result.app}\t${result.accessType}\t${result.requestId}`);
}

if (args.get('inspect-reports') === 'true') {
  for (const result of results) {
    const reports = await appleRequest(
      token,
      `/analyticsReportRequests/${result.requestId}/reports?limit=200`,
    );
    const categories = [...new Set((reports.data || []).map((report) => report.attributes?.category).filter(Boolean))];
    console.log(`reports\t${result.app}\t${result.accessType}\t${reports.meta?.paging?.total ?? reports.data?.length ?? 0}\t${categories.join(',') || 'pending'}`);
    if (args.get('list-core-reports') === 'true' && result === results[0]) {
      for (const report of reports.data || []) {
        const name = String(report.attributes?.name || '');
        if (/download|install|session|crash|engagement|discovery|rating|review|subscription|sales|proceed|revenue|deletion/i.test(name)) {
          console.log(`report\t${report.id}\t${report.attributes?.category || ''}\t${name}`);
        }
      }
    }
  }
}
