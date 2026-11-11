-- Phase 6G.1 — genuine concurrent PostgreSQL sessions for admission gate vs cancel.
-- Run via scripts/meet-admission-postgres-concurrency.cjs (two docker exec psql clients).
-- Not pgTAP; prints machine-readable RESULT lines.
-- Requires 20261028210000_meet_new_admission_gate applied on an authorized disposable DB.

\set ON_ERROR_STOP on

\echo RESULT bootstrap_placeholder
-- Bootstrap and races are orchestrated by the Node runner (separate connections).
-- This file documents the SQL fragments the runner executes under real concurrency:
--
-- 1) Match hold: BEGIN; SELECT try_meet_match(qid) after FOR UPDATE path under gate
--    → matched:false / admission_deferred; no session insert.
-- 2) Cancel concurrent: BEGIN; SELECT cancel_meet_search(qid) while matcher holds or races
--    → cancelled_waiting or already_terminal; never matched session.
-- 3) Join denial concurrent with cancel of unrelated waiting: join raises P0006 with
--    zero new queue rows; cancel still resolves its own queue id.
