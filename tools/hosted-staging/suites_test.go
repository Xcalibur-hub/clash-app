package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	pgerr "github.com/jackc/pgx/v5/pgconn"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSQLBoundaries(t *testing.T) {
	s := "select ';'; -- ;\nselect $$body; extensions.dblink('ignored')$$; /* nested /*;*/; */ select 3;"
	if len(splitSQL(s)) != 3 {
		t.Fatal(splitSQL(s))
	}
	if _, ok := findCall(s); ok {
		t.Fatal("quoted call interpreted")
	}
	c, ok := findCall("select * from extensions.dblink('x',$a$select func(1,2);$a$) as x(v int)")
	if !ok || c.name != "dblink" {
		t.Fatal(c)
	}
	if a, ok := literal("$a$select 1;$a$"); !ok || a != "select 1;" {
		t.Fatal(a, ok)
	}
}
func TestTenFrozenAdaptations(t *testing.T) {
	dir := filepath.Join("..", "..", ".expo", "migration-compatibility-hosted-5u-final")
	raw, e := os.ReadFile(filepath.Join(dir, "hosted-suites.json"))
	if e != nil {
		t.Fatal("run file-only prepare.cjs in fresh checkout first", e)
	}
	b, e := loadBundle(dir, digest(raw))
	if e != nil {
		t.Fatal(e)
	}
	var count int
	for _, s := range b.Suites {
		for _, statement := range splitSQL(s.SQL) {
			for {
				c, ok := findCall(statement)
				if !ok {
					break
				}
				count++
				switch c.name {
				case "dblink_connect", "dblink_disconnect", "dblink_exec", "dblink", "dblink_send_query", "dblink_is_busy", "dblink_get_result", "dblink_error_message":
				default:
					t.Fatal("unimplemented operation", c.name)
				}
				statement = statement[c.end:]
			}
		}
		if !strings.Contains(s.SQL, "rollback;") {
			t.Fatal("outer rollback missing")
		}
		owner, clean := cleanupCall(s.SQL)
		if strings.Contains(s.SQL, "extensions.dblink") && !strings.HasPrefix(s.Name, "076_") && (owner == "" || clean == "") {
			t.Fatal("cleanup not mapped", s.Name)
		}
	}
	if count < 150 {
		t.Fatal("unexpected call count", count)
	}
	t.Logf("89 exact frozen suites, 10 adaptations; %d dblink calls mapped", count)
	bad := b
	bad.Suites[0].SQL += "select 1;"
	bytes, _ := json.Marshal(bad)
	d := t.TempDir()
	os.WriteFile(filepath.Join(d, "hosted-suites.json"), bytes, 0600)
	if _, e = loadBundle(d, digest(bytes)); e == nil {
		t.Fatal("altered source accepted")
	}
}
func TestBridgeConnectUsesVerifiedClient(t *testing.T) {
	c := configTest(t)
	conf, _ := connection(c, "MOCK_SECRET")
	r := &mock{}
	calls := 0
	b := &bridge{main: &mock{}, conf: conf, ctx: context.Background(), remotes: map[string]*remote{}, dial: func(_ context.Context, p *pgx.ConnConfig) (Session, error) {
		calls++
		if p.Password != "MOCK_SECRET" || p.TLSConfig.InsecureSkipVerify || p.Host != conf.Host {
			t.Fatal("dev DSN leaked into connection")
		}
		return r, nil
	}}
	v, e := b.replace(call{name: "dblink_connect", args: "'one','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database()"})
	if e != nil || v != "'OK'" || calls != 1 {
		t.Fatal(v, e)
	}
	if _, e = b.replace(call{name: "dblink_connect", args: "'two','host=evil.example'"}); e == nil || calls != 1 {
		t.Fatal("unexpected connection accepted")
	}
}
func TestDynamicArgumentsStayOnServer(t *testing.T) {
	m := &mock{args: []any{"one", "select computed_value"}}
	r := &mock{}
	b := &bridge{main: m, ctx: context.Background(), remotes: map[string]*remote{"one": {s: r}}}
	_, e := b.replace(call{name: "dblink_exec", args: "'one',format('select %s',current_setting('test.var'))"})
	if e != nil || len(r.queries) != 1 || r.queries[0] != "select computed_value" || !strings.Contains(m.queries[0], "jsonb_build_array") {
		t.Fatal(e, r.queries)
	}
}

type asyncMock struct{ release chan struct{} }

func (m *asyncMock) Query(ctx context.Context, q string, args ...any) (Result, error) {
	select {
	case <-m.release:
		return Result{Rows: []map[string]any{{"payload": map[string]any{"ok": true}}}}, nil
	case <-ctx.Done():
		return Result{}, ctx.Err()
	}
}
func (m *asyncMock) Close(context.Context) error { return nil }
func TestAsyncBusyDrainOrdering(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	m := &mock{args: []any{"one", "select blocked"}}
	remoteMock := &asyncMock{make(chan struct{})}
	b := &bridge{main: m, ctx: ctx, remotes: map[string]*remote{"one": {s: remoteMock}}}
	if _, e := b.replace(call{name: "dblink_send_query", args: "send"}); e != nil {
		t.Fatal(e)
	}
	m.args = []any{"one"}
	v, e := b.replace(call{name: "dblink_is_busy", args: "busy"})
	if e != nil || v != "1" {
		t.Fatal(v, e)
	}
	close(remoteMock.release)
	v, e = b.replace(call{name: "dblink_get_result", args: "result"})
	if e != nil || !strings.Contains(v, "payload") {
		t.Fatal(v, e)
	}
	m.args = []any{"one", "new"}
	if _, e = b.replace(call{name: "dblink_send_query", args: "new"}); e == nil {
		t.Fatal("undrained result reused")
	}
	m.args = []any{"one"}
	v, e = b.replace(call{name: "dblink_get_result", args: "drain"})
	if e != nil || v != records(nil) {
		t.Fatal(v, e)
	}
}
func TestRemoteErrorRedactionPreservesAssertions(t *testing.T) {
	for _, msg := range []string{"Publication disabled", "Challenge is terminal", "Vote changed.", "Question unavailable", "rate limit exceeded: same-key"} {
		e := &pgerr.PgError{Message: msg, Detail: "MOCK_SECRET", Where: "postgres://MOCK_SECRET", Code: "P0001"}
		if safeRemoteError(e) != msg {
			t.Fatal(msg)
		}
	}
	if strings.Contains(safeRemoteError(errors.New("MOCK_SECRET")), "MOCK_SECRET") {
		t.Fatal("leak")
	}
	if strings.Contains(safeRemoteError(&pgerr.PgError{Message: "MOCK_SECRET", Code: "P0001"}), "MOCK_SECRET") {
		t.Fatal("server message leaked")
	}
}
func TestFixtureAuthorizationIsSeparate(t *testing.T) {
	m := &mock{}
	if e := fixtureGate(context.Background(), m, false); e == nil || len(m.queries) > 0 {
		t.Fatal("unauthorized fixture access")
	}
	if e := fixtureGate(context.Background(), m, true); e != nil {
		t.Fatal(e)
	}
}
func TestFixtureCleanupFirstFailure(t *testing.T) {
	r := &mock{fail: "delete from owned_fixture"}
	b := &bridge{ctx: context.Background(), remotes: map[string]*remote{"owner": {s: r}}}
	e := b.cleanup("owner", "delete from owned_fixture")
	if e == nil || !strings.Contains(e.Error(), "quarantine") || strings.Count(strings.Join(r.queries, "\n"), "delete from owned_fixture") != 1 {
		t.Fatal(e, r.queries)
	}
}
func TestMainRollbackFailureNotHidden(t *testing.T) {
	m := &mock{rollbackFail: true}
	_, e := runSuite(context.Background(), m, nil, nil, Suite{SQL: "select 1;"})
	if e == nil || !strings.Contains(e.Error(), "rollback unconfirmed") {
		t.Fatal(e)
	}
}

func TestFrozenNestedResultMapping(t *testing.T) {
	m := &mock{args: []any{"p0-rate-2", false}}
	r := &remote{s: &mock{}, ch: make(chan pending, 1), done: &pending{err: &pgerr.PgError{Message: "rate limit exceeded: same-key", Code: "P0001"}}}
	conf := &pgx.ConnConfig{}
	b := &bridge{main: m, conf: conf, ctx: context.Background(), remotes: map[string]*remote{"p0-rate-2": r}}
	c, ok := findCall(" select * from extensions.dblink_get_result('p0-rate-2', false) as result(status text) ")
	if !ok {
		t.Fatal("nested call missing")
	}
	out, e := b.replace(c)
	if e != nil || out != records(nil) || r.lastError != "rate limit exceeded: same-key" {
		t.Fatal(out, e, r.lastError)
	}
}

func TestFailedSourceCleanupNeverRetried(t *testing.T) {
	r := &mock{fail: "delete from owned_fixture"}
	m := &mock{args: []any{"owner", "delete from owned_fixture"}}
	b := &bridge{main: m, ctx: context.Background(), cleanupOwner: "owner", cleanupSQL: "delete from owned_fixture", remotes: map[string]*remote{"owner": {s: r}}}
	if _, e := b.replace(call{name: "dblink_exec", args: "cleanup"}); e == nil {
		t.Fatal("expected cleanup failure")
	}
	if e := b.cleanup("owner", "delete from owned_fixture"); e == nil {
		t.Fatal("cleanup failure hidden")
	}
	if strings.Count(strings.Join(r.queries, "\n"), "delete from owned_fixture") != 1 {
		t.Fatal("failed cleanup retried")
	}
}
