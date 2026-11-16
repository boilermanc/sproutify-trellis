// Isolated embedded PostgreSQL. No production connection or provider requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const {PGlite}=await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db=new PGlite();
const id='579edbfb-33eb-439a-bee8-a8be1006137e', owner='49e7cdaa-7251-4756-a0f4-fcaf1ae08333';
const source=()=>db.query('select newsletter_resend_source($1,$2,$3) b',[id,owner,'atlurbanfarms']);
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema private;
    create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,private to authenticated;
    alter default privileges in schema public grant all on tables to service_role;
    create table trellis_users(auth_user_id uuid,status text,role text);
    create function private.is_active_trellis_user() returns boolean language sql security definer as $$select exists(select 1 from public.trellis_users where auth_user_id=auth.uid() and status='active')$$;
    create function private.can_manage_marketing() returns boolean language sql security definer as $$select exists(select 1 from public.trellis_users where auth_user_id=auth.uid() and status='active' and role in ('owner','admin','operator'))$$;
    create table campaigns(id uuid primary key default gen_random_uuid(),name text,status text,template text,subject text,
      trigger_type text,segments jsonb,tags jsonb,branches jsonb,audience_size integer,metadata jsonb,created_by text,
      owner_id uuid,campaign_type text,dispatch jsonb,send_status text,launched_at timestamptz);
    create table campaign_recipients(id uuid default gen_random_uuid(),campaign_id uuid references campaigns,email text,
      first_name text,unsubscribe_token text,status text);
    create table campaign_sends(resend_email_id text primary key,campaign_id uuid,email text);
    create table email_events(resend_email_id text,campaign_id uuid,email text,event_type text,
      link_url text,metadata jsonb,occurred_at timestamptz default now());
    create table email_suppressions(email text,reason text,scope text);
    insert into trellis_users values('${owner}','active','owner'),
      ('958d8d72-f2ee-4b12-9568-29d2abfdca23','active','viewer'),
      ('11111111-1111-4111-a111-111111111111','active','operator'),
      ('22222222-2222-4222-a222-222222222222','inactive','operator');
    insert into campaigns(id,name,status,subject,branches,owner_id,dispatch,send_status)
      values('${id}','Original','completed','Hello 🙋‍♀️','["atlurbanfarms"]','${owner}','{"html_template":"Hello {{first_name}}"}','sent');
    insert into campaign_recipients(campaign_id,email,status) values('${id}','test@example.invalid','sent');
    insert into campaign_sends values('provider-id','${id}','test@example.invalid');
    insert into email_events(resend_email_id,campaign_id,email,event_type) values('provider-id',null,'test@example.invalid','delivered');
    create view campaign_recipient_status as select * from email_events;
    create view campaign_recipient_status_by_id as select * from campaign_recipient_status;
    grant all on campaigns,campaign_recipients,campaign_sends,email_events,email_suppressions,campaign_recipient_status,campaign_recipient_status_by_id to anon,authenticated;
    create policy existing_campaign_read on campaigns for select to authenticated using (true);
    create policy existing_campaign_write on campaigns for all to authenticated
      using(owner_id=auth.uid() or private.can_manage_marketing()) with check(owner_id=auth.uid() or private.can_manage_marketing());
    create policy campaign_recipients_app on campaign_recipients for all to anon,authenticated using(true) with check(true);
    create policy existing_event_read on email_events for select to authenticated using(true);
    create policy existing_send_read on campaign_sends for select to authenticated using(true);
    create policy existing_suppression_read on email_suppressions for select to authenticated using(true);`);
  // Use the actual existing shared aggregate view, not only synthetic views.
  const reporting=readFileSync(new URL('../supabase/migrations/20260824220214_fix_rekkrd_email_consent_and_campaign_stats.sql',import.meta.url),'utf8');
  const statsView=reporting.slice(reporting.indexOf('CREATE OR REPLACE VIEW campaign_stats_by_id'),reporting.indexOf('CREATE OR REPLACE VIEW campaign_recipient_status_by_id'));
  await db.exec(statsView);
  const migration=readFileSync(new URL('../supabase/migrations/20261115145257_newsletter_resend_safety.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query("select has_table_privilege('anon','campaign_recipients','select') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','campaign_recipients','truncate') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('anon','campaign_recipient_status_by_id','select') allowed")).rows[0].allowed,false);
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query('select has_function_privilege($1, $2, $3) allowed',[role,'newsletter_resend_source(uuid,uuid,text)','execute'])).rows[0].allowed,false);
    assert.equal((await db.query('select has_function_privilege($1, $2, $3) allowed',[role,'enqueue_newsletter_reminder(uuid,uuid,text,text,text,jsonb,text)','execute'])).rows[0].allowed,false);
  }
  await db.exec('set role service_role');
  const b=(await source()).rows[0].b;assert.equal(b.events.length,1);assert.equal(b.sends[0].resend_email_id,'provider-id');
  await assert.rejects(db.query('select newsletter_resend_source($1,$2,$3)',[id,'958d8d72-f2ee-4b12-9568-29d2abfdca23','atlurbanfarms']),/access denied/);
  await assert.rejects(db.query('select newsletter_resend_source($1,$2,$3)',[id,owner,'rekkrd']),/access denied/);
  const enqueue=(version=b.source_version,recipients=[{email:'test@example.invalid'}])=>db.query('select enqueue_newsletter_reminder($1,$2,$3,$4,$5,$6,$7) c',[id,owner,'atlurbanfarms','Reminder',version,JSON.stringify(recipients),'fingerprint']);
  await assert.rejects(enqueue('stale'),/Source changed/);
  await assert.rejects(enqueue(b.source_version,[{email:'another-business@example.invalid'}]),/does not belong/);
  await assert.rejects(enqueue(b.source_version,[{email:'test@example.invalid'},{email:'test@example.invalid'}]),/Duplicate or missing/);
  assert.equal((await db.query('select count(*)::int n from campaigns')).rows[0].n,1); // rollback is atomic
  const queued=(await enqueue()).rows[0].c;
  assert.equal(queued.metadata.resend_of,id);assert.equal(queued.send_status,'queued');assert.equal(queued.dispatch.cc,null);
  assert.equal((await db.query('select count(*)::int n from campaign_recipients where campaign_id=$1',[queued.id])).rows[0].n,1);
  await assert.rejects(enqueue(),/duplicate key/);
  await db.exec(`reset role;set request.jwt.claim.sub='958d8d72-f2ee-4b12-9568-29d2abfdca23';set role authenticated`);
  assert.equal((await db.query('select count(*)::int n from campaigns')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from campaign_recipients')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from campaign_sends')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from campaign_recipient_status_by_id')).rows[0].n,1);
  assert.equal((await db.query('select sent from campaign_stats_by_id where campaign_id=$1',[id])).rows[0].sent,1);
  assert.equal((await db.query("update campaigns set subject='forbidden' where id=$1 returning id",[id])).rows.length,0);
  await assert.rejects(db.exec('truncate campaign_recipients'),/permission denied/);
  for (const account of ['33333333-3333-4333-a333-333333333333','22222222-2222-4222-a222-222222222222']) {
    await db.exec(`reset role;set request.jwt.claim.sub='${account}';set role authenticated`);
    for(const table of ['campaigns','campaign_recipients','campaign_sends','email_events','email_suppressions','campaign_recipient_status_by_id','campaign_stats_by_id']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
    }
  }
  await db.exec(`reset role;set request.jwt.claim.sub='${owner}';set role authenticated`);
  assert.equal((await db.query('select count(*)::int n from campaigns')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from campaign_recipient_status_by_id')).rows[0].n,1);
  await assert.rejects(db.query('update campaigns set subject=$1 where id=$2',['Bypass',queued.id]),/server newsletter reminder preview/);
  await assert.rejects(db.query('update campaign_recipients set email=$1 where campaign_id=$2',['bypass@example.invalid',queued.id]),/managed by the server/);
  await assert.rejects(db.query('delete from campaign_recipients where campaign_id=$1',[queued.id]),/managed by the server/);
  await assert.rejects(db.query('insert into campaigns(metadata) values($1)',[JSON.stringify({resend_of:id})]),/server newsletter reminder preview/);
  await db.exec(`reset role;insert into campaigns(name,owner_id) values('Legacy shared',null);
    insert into email_events(resend_email_id,campaign_id,email,event_type) values('transactional',null,'transactional@example.invalid','delivered');
    set request.jwt.claim.sub='958d8d72-f2ee-4b12-9568-29d2abfdca23';set role authenticated`);
  assert.equal((await db.query('select count(*)::int n from campaigns')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int n from campaign_recipient_status_by_id')).rows[0].n,2);
  await db.exec('reset role;set role service_role');
  const operatorSource=await db.query('select newsletter_resend_source($1,$2,$3) b',[id,'11111111-1111-4111-a111-111111111111','atlurbanfarms']);
  assert.equal(operatorSource.rows[0].b.authorized_for,'11111111-1111-4111-a111-111111111111');
  await db.exec('reset role;drop table campaign_recipients cascade;');
  await db.exec(migration);
  assert.equal((await db.query("select column_name from information_schema.columns where table_name='campaign_recipients' and column_name='created_at'")).rows.length,1);
  assert.equal((await db.query("select has_table_privilege('anon','campaign_recipients','select') allowed")).rows[0].allowed,false);
  console.log('PASS: migration applies twice; shared staff reporting; external/inactive isolation; owner/operator authorization; atomic rollback; duplicate/repeat guard; legacy-client bypass blocked.');
} finally {await db.close();}
