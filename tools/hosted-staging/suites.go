package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	pgerr "github.com/jackc/pgx/v5/pgconn"
)

// The bridge interprets only the ten frozen suites' dblink API calls. It does not
// implement a SQL language: argument expressions/assertions stay on PostgreSQL.
// Independent client sessions replace server-side dblink credentials/functions.
//
//go:embed suite-hashes.json
var suiteHashes []byte

type Suite struct {
	Name       string `json:"name"`
	SourceHash string `json:"source_sha256"`
	SQL        string `json:"sql"`
}
type Bundle struct {
	Candidate string  `json:"candidate"`
	Suites    []Suite `json:"suites"`
}
type pending struct {
	result Result
	err    error
}
type remote struct {
	s         Session
	ch        chan pending
	done      *pending
	lastError string
	drained   bool
}
type bridge struct {
	cleanupOwner, cleanupSQL    string
	cleanupStarted, cleanupDone bool
	main                        Session
	conf                        *pgx.ConnConfig
	dial                        Connector
	remotes                     map[string]*remote
	ctx                         context.Context
}

// Quoted strings, identifiers, dollar bodies and nested comments are opaque.
func quoted(s string, i int) (int, bool) {
	if strings.HasPrefix(s[i:], "--") {
		if k := strings.IndexByte(s[i:], '\n'); k >= 0 {
			return i + k + 1, true
		}
		return len(s), true
	}
	if strings.HasPrefix(s[i:], "/*") {
		depth := 1
		j := i + 2
		for j < len(s) && depth > 0 {
			if strings.HasPrefix(s[j:], "/*") {
				depth++
				j += 2
			} else if strings.HasPrefix(s[j:], "*/") {
				depth--
				j += 2
			} else {
				j++
			}
		}
		return j, true
	}
	if s[i] == '\'' || s[i] == '"' {
		quote := s[i]
		for j := i + 1; j < len(s); j++ {
			if s[j] == quote {
				if j+1 < len(s) && s[j+1] == quote {
					j++
					continue
				}
				return j + 1, true
			}
		}
		return len(s), true
	}
	if s[i] == '$' {
		j := i + 1
		for j < len(s) && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= '0' && s[j] <= '9') || s[j] == '_') {
			j++
		}
		if j < len(s) && s[j] == '$' {
			tag := s[i : j+1]
			if k := strings.Index(s[j+1:], tag); k >= 0 {
				return j + 1 + k + len(tag), true
			}
			return len(s), true
		}
	}
	return i, false
}
func splitSQL(s string) []string {
	out := []string{}
	start := 0
	for i := 0; i < len(s); {
		if j, ok := quoted(s, i); ok {
			i = j
			continue
		}
		if s[i] == ';' {
			out = append(out, s[start:i+1])
			start = i + 1
		}
		i++
	}
	if strings.TrimSpace(s[start:]) != "" {
		out = append(out, s[start:])
	}
	return out
}

type call struct {
	start, end int
	name, args string
}

func findCall(s string) (call, bool) {
	for i := 0; i < len(s); {
		if j, ok := quoted(s, i); ok {
			i = j
			continue
		}
		if strings.HasPrefix(s[i:], "extensions.dblink") {
			j := i + len("extensions.")
			k := j
			for k < len(s) && ((s[k] >= 'a' && s[k] <= 'z') || s[k] == '_') {
				k++
			}
			name := s[j:k]
			for k < len(s) && (s[k] == ' ' || s[k] == '\n' || s[k] == '\r') {
				k++
			}
			if k >= len(s) || s[k] != '(' {
				i++
				continue
			}
			start := k + 1
			depth := 1
			k++
			for k < len(s) {
				if n, ok := quoted(s, k); ok {
					k = n
					continue
				}
				if s[k] == '(' {
					depth++
				}
				if s[k] == ')' {
					depth--
					if depth == 0 {
						return call{i, k + 1, name, s[start:k]}, true
					}
				}
				k++
			}
		}
		i++
	}
	return call{}, false
}
func comma(s string) int {
	depth := 0
	for i := 0; i < len(s); {
		if j, ok := quoted(s, i); ok {
			i = j
			continue
		}
		if s[i] == '(' {
			depth++
		}
		if s[i] == ')' {
			depth--
		}
		if s[i] == ',' && depth == 0 {
			return i
		}
		i++
	}
	return -1
}
func literal(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if len(s) < 2 {
		return "", false
	}
	end, ok := quoted(s, 0)
	if !ok || end != len(s) {
		return "", false
	}
	if s[0] == '\'' {
		return strings.ReplaceAll(s[1:len(s)-1], "''", "'"), true
	}
	if s[0] == '$' {
		j := strings.IndexByte(s[1:], '$') + 1
		return s[j+1 : len(s)-j-1], true
	}
	return "", false
}
func sqlString(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
func (b *bridge) arguments(args string) ([]any, error) {
	r, e := query(b.ctx, b.main, "select jsonb_build_array("+args+") as args")
	if e != nil || len(r.Rows) != 1 {
		return nil, errors.New("argument evaluation failed")
	}
	raw, _ := json.Marshal(r.Rows[0]["args"])
	var out []any
	e = json.Unmarshal(raw, &out)
	return out, e
}
func (r *remote) poll() {
	if r.ch != nil && r.done == nil {
		select {
		case v := <-r.ch:
			r.done = &v
		default:
		}
	}
}
func (b *bridge) replace(c call) (string, error) {
	if c.name == "dblink_connect" {
		k := comma(c.args)
		if k < 0 || !strings.Contains(c.args[k+1:], "host=127.0.0.1 port=5432 user=postgres password=postgres dbname=") {
			return "", errors.New("unexpected frozen dblink connection")
		}
		name, ok := literal(c.args[:k])
		if !ok || b.remotes[name] != nil {
			return "", errors.New("duplicate/invalid remote name")
		}
		s, e := b.dial(b.ctx, b.conf.Copy())
		if e != nil {
			return "", errors.New("remote TLS connection failed")
		}
		if e = identity(b.ctx, s); e != nil {
			s.Close(b.ctx)
			return "", e
		}
		b.remotes[name] = &remote{s: s}
		return "'OK'", nil
	}
	args, e := b.arguments(c.args)
	if e != nil || len(args) == 0 {
		return "", errors.New("missing remote argument")
	}
	name, ok := args[0].(string)
	if !ok {
		return "", errors.New("remote name required")
	}
	r := b.remotes[name]
	if r == nil {
		return "", errors.New("unrecognized session")
	}
	switch c.name {
	case "dblink_exec":
		if len(args) != 2 {
			return "", errors.New("unexpected exec signature")
		}
		sql, ok := args[1].(string)
		if !ok {
			return "", errors.New("SQL argument required")
		}
		sourceCleanup := name == b.cleanupOwner && sql == b.cleanupSQL && sql != ""
		if sourceCleanup {
			b.cleanupStarted = true
		}
		v, e := r.s.Query(b.ctx, sql)
		if e != nil {
			return "", errors.New("remote statement failed")
		}
		if sourceCleanup {
			b.cleanupDone = true
		}
		return sqlString(v.Tag), nil
	case "dblink":
		if len(args) != 2 {
			return "", errors.New("unexpected query signature")
		}
		sql, ok := args[1].(string)
		if !ok {
			return "", errors.New("SQL argument required")
		}
		v, e := r.s.Query(b.ctx, sql)
		if e != nil {
			return "", errors.New("remote query failed")
		}
		return records(v.Rows), nil
	case "dblink_send_query":
		if len(args) != 2 || r.ch != nil {
			return "", errors.New("remote pending/drain contract violated")
		}
		sql, ok := args[1].(string)
		if !ok {
			return "", errors.New("SQL argument required")
		}
		r.ch = make(chan pending, 1)
		r.done = nil
		r.drained = false
		r.lastError = ""
		go func() { v, e := r.s.Query(b.ctx, sql); r.ch <- pending{v, e} }()
		return "1", nil
	case "dblink_is_busy":
		r.poll()
		if r.ch != nil && r.done == nil {
			return "1", nil
		}
		return "0", nil
	case "dblink_get_result":
		if r.ch == nil {
			return records(nil), nil
		}
		if r.done == nil {
			select {
			case v := <-r.ch:
				r.done = &v
			case <-b.ctx.Done():
				return "", errors.New("remote bounded wait expired")
			}
		}
		if r.drained {
			r.ch = nil
			r.done = nil
			r.drained = false
			return records(nil), nil
		}
		r.drained = true
		if r.done.err != nil {
			r.lastError = safeRemoteError(r.done.err)
			if len(args) < 2 || args[1] != false {
				return "", errors.New("remote asynchronous statement failed")
			}
			return records(nil), nil
		}
		return records(r.done.result.Rows), nil
	case "dblink_error_message":
		return sqlString(r.lastError), nil
	case "dblink_disconnect":
		if e = r.s.Close(b.ctx); e != nil {
			return "", errors.New("remote close failed")
		}
		delete(b.remotes, name)
		return "'OK'", nil
	default:
		return "", errors.New("unreviewed dblink operation")
	}
}
func records(rows []map[string]any) string {
	if rows == nil {
		rows = []map[string]any{}
	}
	v, _ := json.Marshal(rows)
	return "jsonb_to_recordset(" + sqlString(string(v)) + "::jsonb)"
}
func safeRemoteError(e error) string {
	var p *pgerr.PgError
	if errors.As(e, &p) { // Only the reviewed assertion needs the server message. Never return Detail/Where/query/connection strings.
		for _, text := range []string{"Publication disabled", "Challenge is terminal", "Vote changed.", "Question unavailable", "rate limit exceeded: same-key"} {
			if strings.Contains(p.Message, text) {
				return text
			}
		}
		return "remote SQLSTATE " + p.Code
	}
	return "remote statement failed"
}
func cleanupCall(source string) (string, string) {
	owner, sql := "", ""
	for _, statement := range splitSQL(source) {
		s := statement
		for {
			c, ok := findCall(s)
			if !ok {
				break
			}
			if c.name == "dblink_exec" {
				k := comma(c.args)
				if k >= 0 {
					n, nok := literal(c.args[:k])
					v, vok := literal(c.args[k+1:])
					if nok && vok && strings.Contains(strings.ToLower(v), "delete from") {
						owner, sql = n, v
					}
				}
			}
			s = s[c.end:]
		}
	}
	return owner, sql
}
func (b *bridge) cleanup(owner, sql string) error {
	// Release only this run's transaction locks before collecting pending workers.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var failed bool
	for _, r := range b.remotes {
		r.poll()
		if r.ch == nil || r.done != nil {
			if _, e := r.s.Query(ctx, "rollback; reset role"); e != nil {
				failed = true
			}
		}
	}
	for _, r := range b.remotes {
		if r.ch != nil && r.done == nil {
			select {
			case v := <-r.ch:
				r.done = &v
			case <-ctx.Done():
				failed = true
			}
		}
		if _, e := r.s.Query(ctx, "rollback; reset role"); e != nil {
			failed = true
		}
	}
	if b.cleanupStarted && !b.cleanupDone {
		failed = true
	}
	if !failed && sql != "" && !b.cleanupDone {
		r := b.remotes[owner]
		if r == nil { // Normal source cleanup already disconnected; never rerun it.
			if len(b.remotes) != 0 {
				failed = true
			}
		} else {
			if _, e := r.s.Query(ctx, "begin"); e != nil {
				failed = true
			} else if _, e = r.s.Query(ctx, sql); e != nil {
				failed = true
				r.s.Query(ctx, "rollback")
			} else if _, e = r.s.Query(ctx, "commit"); e != nil {
				failed = true
			}
		}
	}
	for _, r := range b.remotes {
		if e := r.s.Close(ctx); e != nil {
			failed = true
		}
	}
	if failed {
		return errors.New("fixture cleanup unconfirmed; quarantine target, no retry")
	}
	return nil
}
func runSuite(ctx context.Context, main Session, conf *pgx.ConnConfig, dial Connector, s Suite) (tap []string, err error) {
	b := &bridge{main: main, conf: conf, dial: dial, ctx: ctx, remotes: map[string]*remote{}}
	owner, cleanup := cleanupCall(s.SQL)
	b.cleanupOwner = owner
	b.cleanupSQL = cleanup
	defer func() {
		if _, e := main.Query(context.Background(), "rollback"); e != nil {
			err = errors.New("main rollback unconfirmed; quarantine target")
		}
		if e := b.cleanup(owner, cleanup); e != nil {
			err = e
		}
	}()
	for _, statement := range splitSQL(s.SQL) {
		// The hosted derivative needs no server-side dblink extension or its hooks.
		if strings.Contains(strings.ToLower(statement), "create extension if not exists dblink with schema extensions;") {
			continue
		}
		// One frozen 053 lives_ok body executes a dblink call dynamically. Resolve
		// this exact reviewed body as well; never interpret arbitrary quoted SQL.
		const nested = "$$ select * from extensions.dblink_get_result('p0-rate-2', false) as result(status text) $$"
		if strings.Contains(statement, nested) {
			inner := strings.TrimSuffix(strings.TrimPrefix(nested, "$$"), "$$")
			c, ok := findCall(inner)
			if !ok {
				return tap, errors.New("nested mapping missing")
			}
			replacement, e := b.replace(c)
			if e != nil {
				return tap, e
			}
			inner = inner[:c.start] + replacement + inner[c.end:]
			statement = strings.Replace(statement, nested, sqlString(inner), 1)
		}
		for {
			c, ok := findCall(statement)
			if !ok {
				break
			}
			replacement, e := b.replace(c)
			if e != nil {
				return tap, e
			}
			statement = statement[:c.start] + replacement + statement[c.end:]
		}
		r, e := query(ctx, main, statement)
		if e != nil {
			return tap, e
		}
		for _, row := range r.Rows {
			for _, v := range row {
				if text, ok := v.(string); ok && (strings.HasPrefix(strings.TrimSpace(text), "ok ") || strings.HasPrefix(strings.TrimSpace(text), "not ok ") || strings.HasPrefix(strings.TrimSpace(text), "1..") || strings.HasPrefix(strings.TrimSpace(text), "#") || strings.HasPrefix(strings.TrimSpace(text), "Bail out!")) {
					tap = append(tap, text)
					normalized := strings.TrimSpace(text)
					if strings.HasPrefix(normalized, "Bail out!") || (strings.HasPrefix(normalized, "not ok ") && !strings.Contains(strings.ToLower(normalized), "# skip") && !strings.Contains(strings.ToLower(normalized), "# todo")) {
						return tap, errors.New("first TAP failure; stopped before further statements")
					}

				}
			}
		}
	}
	return tap, nil
}
func loadBundle(dir, expectedHash string) (Bundle, error) {
	var b Bundle
	raw, e := os.ReadFile(filepath.Join(dir, "hosted-suites.json"))
	if e != nil || digest(raw) != expectedHash {
		return b, errors.New("hosted suite manifest mismatch")
	}
	if e = json.Unmarshal(raw, &b); e != nil {
		return b, e
	}
	var trusted map[string]string
	if json.Unmarshal(suiteHashes, &trusted) != nil {
		return b, errors.New("invalid compiled suite seal")
	}
	adapted := 0
	previous := ""
	if b.Candidate != seal || len(b.Suites) != 89 {
		return b, errors.New("suite lineage mismatch")
	}
	for _, s := range b.Suites {
		if previous >= s.Name || digest([]byte(s.SQL)) != s.SourceHash || trusted[s.Name] != s.SourceHash {
			return b, errors.New("frozen suite changed")
		}
		previous = s.Name
		if strings.Contains(s.SQL, "extensions.dblink") {
			adapted++
			if _, sql := cleanupCall(s.SQL); sql == "" && !strings.HasPrefix(s.Name, "076_") {
				return b, errors.New("suite cleanup missing")
			}
		}
	}
	if adapted != 10 {
		return b, errors.New("dblink inventory mismatch")
	}
	return b, nil
}
func fixtureGate(ctx context.Context, s Session, authorized bool) error {
	if !authorized {
		return errors.New("separate committed-fixture authorization required")
	}
	if e := identity(ctx, s); e != nil {
		return e
	}
	r, e := query(ctx, s, sterileSQL)
	if e != nil || len(r.Rows) != 1 {
		return errors.New("sterile fixture target unavailable")
	}
	for _, k := range []string{"profiles", "users", "takes", "rates", "clashes", "verdicts", "notifications", "rewards"} {
		if fmt.Sprint(r.Rows[0][k]) != "0" {
			return errors.New("nonsterile target refused")
		}
	}
	return nil
}
