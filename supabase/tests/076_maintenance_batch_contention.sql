begin;
select no_plan();
create extension if not exists dblink with schema extensions;
-- Existing local CLI development credentials; no hosted connection.
select extensions.dblink_connect('maintenance-holder','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('maintenance-holder','begin');
select * from extensions.dblink('maintenance-holder',
 $$select pg_try_advisory_xact_lock(hashtextextended('arena-maintenance-batch',0))$$) as held(acquired boolean);
select is(run_maintenance(500)->>'skipped','true','overlapping maintenance reports skipped instead of success');
select is(run_maintenance(500)->>'reason','maintenance_in_progress','overlapping maintenance exposes safe retry reason');
select is(settle_due_clashes(500),0,'overlapping settlement batch does not wait holding item locks');
select is(transition_due_arena_rooms(500),0,'overlapping Room batch does not wait holding item locks');
select extensions.dblink_exec('maintenance-holder','commit');
select is(run_maintenance(0)->>'partial_failure','false','next maintenance attempt runs after competing batch releases lock');
select extensions.dblink_disconnect('maintenance-holder');
select * from finish();
rollback;
