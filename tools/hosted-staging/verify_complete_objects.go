package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

// Fail-safe final-state probes. Every check is guarded by to_regclass /
// to_regprocedure / catalog oids, so a missing table, column or function makes
// the probe return false instead of raising a SQL error; any false fails the
// run. There is no ::regclass / ::regprocedure cast that could hard-error.
const verifyCompleteObjectsSQL = `select
  to_regclass('public.course_lessons') is not null as course_lessons,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='profile_clash_stats') as v105_profile_clash_stats,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='arena_comment_notify') as v106_arena_comment_notify,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='notify_arena_comment') as v106_notify_arena_comment,
  exists(select 1 from pg_trigger where tgname='comments_notify_arena'
    and tgrelid=to_regclass('public.comments')) as v106_comments_notify_trigger,
  to_regclass('public.arena_interest_preferences') is not null as arena_interest_preferences,
  to_regclass('public.explore_challenge_results') is not null as explore_challenge_results,
  exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where t.typname='geometry' and n.nspname in ('extensions','public')) as postgis_geometry_type,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.reputation_events')),false) as reputation_rls_enabled,
  coalesce((select not polpermissive from pg_policy where polrelid=to_regclass('public.reputation_events')
    and polname='reputation history owner boundary'),false) as h3_reputation_owner_gate,
  coalesce((select bool_and(not has_column_privilege('anon',a.attrelid,a.attname,'select'))
    from pg_attribute a where a.attrelid=to_regclass('public.course_lessons')
      and a.attname in ('body_text','media_object_id')),false) as h2_lesson_content_guarded,
  coalesce((select bool_and(not has_function_privilege('anon',p.oid,'execute'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='clash_notify'),false) as h1_notify_guarded`

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func verifyCompleteObjects(ctx context.Context, s Session, report map[string]any) error {
	objs, e := query(ctx, s, verifyCompleteObjectsSQL)
	if e != nil {
		return e
	}
	report["expected_objects"] = objs.Rows
	if len(objs.Rows) != 1 {
		return errors.New("expected-object probe incomplete; drift detected")
	}
	missing := []string{}
	for k, v := range objs.Rows[0] {
		if v != true {
			missing = append(missing, k)
		}
	}
	sort.Strings(missing)
	if len(missing) != 0 {
		report["missing_expected_objects"] = missing
		return errors.New("expected migrated objects missing or unguarded; drift detected")
	}
	return nil
}

// verifyCompleteExtensions separates availability from installation. Managed
// pgcrypto must be installed, pg_cron must be installed (the scheduler contract
// depends on it), and all five reviewed extensions must remain available.
func verifyCompleteExtensions(ctx context.Context, s Session, report map[string]any) error {
	ext, e := query(ctx, s, extensionsSQL)
	if e != nil {
		return e
	}
	report["installed_extensions"] = ext.Rows
	if !pgcryptoManagedReady(ext.Rows) {
		return errors.New("managed pgcrypto prerequisite mismatch")
	}
	installed := map[string]bool{}
	for _, v := range ext.Rows {
		installed[fmt.Sprint(v["name"])] = true
	}
	report["installed_extension_names"] = sortedKeys(installed)
	if !installed["pg_cron"] {
		return errors.New("required extension not installed: pg_cron")
	}
	avail, e := query(ctx, s, availableExtensionsSQL)
	if e != nil {
		return e
	}
	available := map[string]bool{}
	for _, v := range avail.Rows {
		available[fmt.Sprint(v["name"])] = true
	}
	report["available_extension_names"] = sortedKeys(available)
	states := map[string]string{}
	for _, name := range []string{"pgcrypto", "postgis", "pg_cron", "pgtap", "dblink"} {
		if !available[name] {
			return errors.New("required extension unavailable: " + name)
		}
		if installed[name] {
			states[name] = "installed"
		} else {
			states[name] = "available_not_installed"
		}
	}
	report["required_extension_states"] = states
	return nil
}
