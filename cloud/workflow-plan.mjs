// GitHub workflow entry point: never invokes the execution branch or a client.
import { resolve, buildSql } from './preflight.mjs';
const projectRef = process.env.DISPOSABLE_PROJECT_REF ?? '';
const host = `db.${projectRef}.supabase.co`;
resolve({ projectRef, confirmProjectRef: projectRef, disposable: true, host, confirmHost: host,
  user: 'postgres', port: 5432, sslmode: 'verify-full', caSha256: '0'.repeat(64) }, process.env);
buildSql('0'.repeat(32));
console.log('OFFLINE_PLAN_ONLY: protected references rejected; immutable read-only SQL verified. No credentials or connection. The zero digest is a plan placeholder, never an approved CA identity.');
