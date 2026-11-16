// Embedded PostgreSQL only. The HTTP function records synthetic calls locally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema private;create schema vault;create schema net;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table public.campaigns(id int,send_status text,last_attempt_at timestamptz,updated_at timestamptz);
    create table private.requests(url text,headers jsonb,body jsonb,timeout_ms int);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin
      insert into private.requests values(url,headers,body,timeout_milliseconds);return 1;end$$;
    create function private.post_scheduler_worker(text) returns bigint language plpgsql as $$begin raise exception 'Generic worker must remain unchanged';end$$;
    create function public.run_campaign_sender_tick() returns void language plpgsql security definer set search_path='' as $$begin
      update public.campaigns set send_status='queued',updated_at=now() where send_status='sending' and last_attempt_at<now()-interval '15 minutes';
      perform private.post_scheduler_worker('campaign-sender');end$$;
    insert into public.campaigns values(1,'sending',now()-interval '20 minutes',now()),(2,'sending',now(),now());`);
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261116151520_newsletter_scheduler_authorization.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from private.requests')).rows[0].n,0);
  assert.equal((await db.query("select send_status from campaigns where id=1")).rows[0].send_status,'sending');
  await assert.rejects(db.exec('select public.run_campaign_sender_tick()'),/no rows/);
  await db.exec("insert into vault.decrypted_secrets values('trellis_scheduler_service_role_key','gateway-fixture')");
  await assert.rejects(db.exec('select public.run_campaign_sender_tick()'),/no rows/);
  await db.exec("insert into vault.decrypted_secrets values('newsletter_worker_token','short')");
  await assert.rejects(db.exec('select public.run_campaign_sender_tick()'),/not configured safely/);
  assert.equal((await db.query("select send_status from campaigns where id=1")).rows[0].send_status,'sending');
  const token='fixture_newsletter_scheduler_012345678901234567890123456789';
  await db.query("update vault.decrypted_secrets set decrypted_secret=$1 where name='newsletter_worker_token'",[token]);
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    await assert.rejects(db.exec('select public.run_campaign_sender_tick()'),/permission denied/);
    await assert.rejects(db.exec('select private.post_newsletter_worker()'),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await assert.rejects(db.exec('select private.post_newsletter_worker()'),/permission denied/);
  await db.exec('select public.run_campaign_sender_tick();reset role');
  const rows=(await db.query('select * from private.requests')).rows;assert.equal(rows.length,1);
  assert.equal(rows[0].url,'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/campaign-sender');
  assert.equal(rows[0].headers.Authorization,'Bearer gateway-fixture');assert.equal(rows[0].headers['x-newsletter-worker-token'],token);
  assert.deepEqual(rows[0].body,{});assert.equal(rows[0].timeout_ms,10000);
  assert.equal((await db.query('select send_status from campaigns where id=1')).rows[0].send_status,'queued');
  assert.equal((await db.query('select send_status from campaigns where id=2')).rows[0].send_status,'sending');
  await db.exec("insert into vault.decrypted_secrets values('newsletter_worker_token','duplicate')");
  await assert.rejects(db.exec('select public.run_campaign_sender_tick()'),/more than one row/);
  assert.equal((await db.query('select count(*)::int n from private.requests')).rows[0].n,1);
  await assert.rejects(db.exec("select private.post_scheduler_worker('lead-sequence-worker')"),/Generic worker must remain unchanged/);
  console.log('PASS: idempotent migration, no invocation on apply, dedicated header, gateway auth, service-only tick, private helper denied, unchanged reaper/other workers, missing/invalid/duplicate secrets fail closed. No real HTTP.');
} finally {await db.close();}
