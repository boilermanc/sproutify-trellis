// Isolated PostgreSQL (PGlite). Never connects to a remote database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = process.env.PGLITE_MODULE ? await import(pathToFileURL(process.env.PGLITE_MODULE).href) : await import('@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';`);
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261020140327_shared_x_tracking.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM x_shared_account')).rows[0].n, 1);
  for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM x_shared_account'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM x_tracked_posts'), /permission denied/);
    await assert.rejects(db.query("SELECT record_x_post('{}'::jsonb)"), /permission denied/);
    await db.exec('RESET ROLE');
  }
  await db.exec("SET ROLE service_role; SET TIME ZONE 'Pacific/Auckland'");
  const post = { post_id: '1848765432109876543', account_id: '123', is_own: true, text: 'fixture', published_at: '2026-10-20T12:00:00Z', metrics: { like_count: 0, impression_count: 12 } };
  await db.query('SELECT record_x_post($1::jsonb, true)', [JSON.stringify(post)]);
  await db.exec(`UPDATE x_tracked_posts SET project_tags = '["project-a","project-b"]', mention_status = 'done';`);
  await db.query('SELECT record_x_post($1::jsonb, false)', [JSON.stringify({ ...post, metrics: { like_count: 1, impression_count: 16 } })]);
  const result = (await db.query('SELECT * FROM x_tracked_posts')).rows[0];
  assert.deepEqual(result.project_tags, ['project-a','project-b']);
  assert.equal(result.mention_status, 'done');
  assert.equal(result.is_mention, true);
  assert.equal(result.metrics.impression_count, 16);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM x_post_daily')).rows[0].n, 1);
  assert.equal((await db.query("SELECT snapshot_date = (now() AT TIME ZONE 'UTC')::date AS utc FROM x_post_daily")).rows[0].utc, true);
  await assert.rejects(db.query('SELECT record_x_post($1::jsonb)', [JSON.stringify({ ...post, post_id: 'invalid' })]));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM x_tracked_posts')).rows[0].n, 1);
  // The same conditional UPDATE used by the collector grants exactly one lease.
  const lease = `UPDATE x_shared_account SET locked_until = now() + interval '4 minutes'
    WHERE locked_until IS NULL OR locked_until < now() RETURNING id`;
  assert.equal((await db.query(lease)).rows.length, 1);
  assert.equal((await db.query(lease)).rows.length, 0);
  console.log('PASS shared X SQL: idempotency, restricted grants, upsert/tag preservation, one daily UTC snapshot, invalid-input rollback, exclusive lease.');
} finally { await db.close(); }
