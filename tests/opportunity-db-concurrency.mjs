// Only for the explicitly named disposable local container, never a remote database.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const container = process.env.OPPORTUNITY_TEST_CONTAINER;
if (!container || !/^trellis-opportunity-test-[a-z0-9-]+$/.test(container)) throw new Error('Set OPPORTUNITY_TEST_CONTAINER to a disposable trellis-opportunity-test-* container.');
function query(sql) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve({ code, output })); });
  child.stdin.end(sql);
  return done;
}
const scope = { brand_id: '20000000-0000-4000-8000-000000000002', branch_id: '10000000-0000-4000-8000-000000000002', project_id: 'fixture-music' };
function sql(suffix, hold = false) {
  const brief = { ...scope, id: '30000000-0000-4000-8000-000000000002', version_id: `40000000-0000-4000-8000-0000000000${suffix}`, version: 1, status: 'draft', supersedes_version_id: null, author_id: '50000000-0000-4000-8000-000000000001', reviewer_id: null, approved_at: null, created_at: '2026-09-22T12:00:00Z' };
  return `BEGIN; SET LOCAL ROLE service_role; SELECT append_opportunity_brief('${JSON.stringify(brief)}'::jsonb,NULL); ${hold ? 'SELECT pg_sleep(1);' : ''} COMMIT;`;
}
const initial = await query(`SELECT count(*) FROM opportunity_brief_versions WHERE brand_id='${scope.brand_id}';`);
assert.equal(initial.code, 0, initial.output);
assert.equal(initial.output.trim(), '0', 'Use a fresh fixture database; this script does not reset existing data.');
const results = await Promise.all([query(sql('11', true)), query(sql('12'))]);
assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results));
assert.match(results.find(result => result.code !== 0).output, /Brief changed; reload before saving/);
const rows = await query(`SELECT count(*) FROM opportunity_brief_versions WHERE brand_id='${scope.brand_id}';`);
assert.equal(rows.output.trim(), '1');
console.log('PASS: two concurrent initial saves produce one snapshot and one conflict; no overwrite.');
