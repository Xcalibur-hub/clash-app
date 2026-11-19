# Independent material-defect confirmation: STOP

Fresh independent reviewer `/root/independent_package_review` confirmed after
the policy runtime tests failed: **FAIL; material functional defect; stop Phase
3G certification.** No further package edits or certification runs followed.

`preparation/phase3f/package/supabase/cloud/tools/lib/clash-native.ps1:3758`:

```powershell
^aws-[0-9]+-[a-z0-9]+-[a-z0-9]+\.pooler\.supabase\.com$
```

The pattern allows only two region segments. Actual AWS region forms here have
three. The independent reviewer called the actual pure `Resolve-ExecutionPolicy`
with the existing synthetic CA fixture, process-only synthetic password, correct
`postgres.<ref>` username and port 5432. No native connection process was called.

| Host | Observed result |
|---|---|
| `aws-0-ap-south-1.pooler.supabase.com` | Rejected: host not permitted |
| `aws-0-ap-southeast-1.pooler.supabase.com` | Rejected: host not permitted |
| `aws-0-ap-south.pooler.supabase.com` | Accepted as pooler, port 5432 |

This is distinct from the authorized port correction: a valid host never reaches
the port-validation branch. It blocks the intended session-pooler route. It
fails closed; no authorization bypass or credential disclosure was demonstrated.
The hostnames are synthetic resolver arguments, not discovered project endpoints.

The reviewer checked the new `test-execution-policy.ps1` harness: legitimate
positive hostname and correct arguments. Its 6/19 result (`policy-tests.json`)
is consistent with this defect; 13 failures include cascading negative tests
which hit host rejection before their intended validation. This is one root
cause, not proof of 13 independent product defects.

The earlier independent offline-integrity PASS did not establish valid pooler
behavior. No repairs, file writes, credential loading, database connection,
migration, Git initialization or commit were performed by the reviewer. Parent
records the returned review here. Minimal next action requires owner approval
to repair this newly identified defect and resume offline certification.
