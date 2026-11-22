#!/usr/bin/env bash
# Disposable CI PostgreSQL only. The fixture marker must exist before any writes.
set -euo pipefail
: "${PG_CONTAINER:?PG_CONTAINER must identify the disposable CI PostgreSQL container}"
[[ "$PG_CONTAINER" =~ ^[a-f0-9]+$ ]] || { echo 'Expected a Docker container ID'; exit 1; }
sql() { docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"; }
[[ "$(sql -Atc 'SELECT scope FROM public.trellis_metric_rpc_fixture_scope')" == OFFLINE_FIXTURE_ONLY ]]

scratch=$(mktemp -d "${TMPDIR:-/tmp}/trellis-metric-rpc.XXXXXX")
first_pid=''
second_pid=''
cleanup() {
  sql -c "UPDATE public.trellis_metric_rpc_fixture_scope SET released=true WHERE scope='OFFLINE_FIXTURE_ONLY'" >/dev/null 2>&1 || true
  if [[ -n "$first_pid" ]]; then wait "$first_pid" 2>/dev/null || true; fi
  if [[ -n "$second_pid" ]]; then wait "$second_pid" 2>/dev/null || true; fi
  rm -f -- "$scratch/first.log" "$scratch/second.log"
  rmdir -- "$scratch"
}
trap cleanup EXIT
sql -c "UPDATE public.trellis_metric_rpc_fixture_scope SET released=false WHERE scope='OFFLINE_FIXTURE_ONLY'" >/dev/null

sql >"$scratch/first.log" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.trellis_upsert_youtube_daily_metrics('[{"youtube_video_id":"concurrent1","metric_date":"2026-11-20","episode_id":"00000000-0000-4000-8000-000000000001","publication_id":"00000000-0000-4000-8000-000000000002","views":111}]'::jsonb);
RESET ROLE;
SELECT 'FIRST_WRITE_READY';
DO $$ DECLARE deadline timestamptz:=clock_timestamp()+interval '30 seconds';
BEGIN
  WHILE NOT (SELECT released FROM public.trellis_metric_rpc_fixture_scope WHERE scope='OFFLINE_FIXTURE_ONLY') LOOP
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Concurrency fixture release timed out'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;
COMMIT;
SQL
first_pid=$!

first_ready=false
for _ in {1..100}; do
  if grep -q FIRST_WRITE_READY "$scratch/first.log"; then first_ready=true; break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then cat "$scratch/first.log"; exit 1; fi
  sleep 0.05
done
[[ "$first_ready" == true ]] || { echo 'First transaction did not reach the barrier'; cat "$scratch/first.log"; exit 1; }

sql >"$scratch/second.log" 2>&1 <<'SQL' &
SET application_name='trellis-metric-rpc-second';
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.trellis_upsert_youtube_daily_metrics('[{"youtube_video_id":"concurrent1","metric_date":"2026-11-20","studio_album_id":"00000000-0000-4000-8000-000000000007","studio_publication_id":"00000000-0000-4000-8000-000000000008","views":222}]'::jsonb);
COMMIT;
SQL
second_pid=$!

# Observe the actual unique-key wait, rather than assuming a sleep creates a race.
blocked=false
for _ in {1..100}; do
  if [[ "$(sql -Atc "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='trellis-metric-rpc-second' AND wait_event_type='Lock')")" == t ]]; then
    blocked=true
    break
  fi
  if ! kill -0 "$second_pid" 2>/dev/null; then cat "$scratch/second.log"; exit 1; fi
  sleep 0.05
done
[[ "$blocked" == true ]] || { echo 'Second transaction never waited on the first insert'; exit 1; }
sql -c "UPDATE public.trellis_metric_rpc_fixture_scope SET released=true WHERE scope='OFFLINE_FIXTURE_ONLY'" >/dev/null
if ! wait "$first_pid"; then cat "$scratch/first.log"; exit 1; fi
first_pid=''
if ! wait "$second_pid"; then cat "$scratch/second.log"; exit 1; fi
second_pid=''

sql >/dev/null <<'SQL'
DO $$ DECLARE r public.trellis_youtube_daily_metrics%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='concurrent1')<>1 THEN
    RAISE EXCEPTION 'Concurrent callers duplicated the unique metric key';
  END IF;
  SELECT * INTO STRICT r FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='concurrent1';
  IF r.episode_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
     OR r.publication_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000002'::uuid
     OR r.studio_album_id IS NOT NULL OR r.studio_publication_id IS NOT NULL
     OR r.views IS DISTINCT FROM 222 THEN
    RAISE EXCEPTION 'Concurrent conflict changed first ownership or lost later metrics';
  END IF;
END $$;
DELETE FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='concurrent1';
SQL
echo 'PASS: competing RPC transactions preserved first ownership and last metrics.'
