# CLASH cloud handoff agent instructions

This is an allowlisted export, not the protected Windows checkout. Read CLOUD_HANDOFF.md before acting.

Inspect git branch, HEAD, status and index before changes. Preserve dirty work and evidence. Never reset, clean, stash or restore unrelated work. Do not assume network or database authorization.

The certified-package directory is immutable deployment evidence at the commit recorded in cloud/package-provenance.json. Preserve all SQL bytes and security gates. Do not run any migration, deploy, seed, Docker, Auth or environment-writing script. The package manifest remains bound to the permanent project; it must not be silently retargeted.

Use npm with the preserved package-lock.json. TypeScript strict, no any, modular components. Only offline checks (typecheck, documented unit tests and cloud policy tests) are authorized by preparation. App startup, device use, Codespaces creation, cloud connections, credentials, commits/pushes/PRs and production operations require their current explicit authorization.

cloud/preflight.mjs plan performs no connection. execute-authorized-readonly requires a new owner authorization for exactly one new disposable project. Both existing hosted references are denied. A failing security/platform gate is a stop condition, never a reason to escalate or fake a schema.

For handoff, record exact base and new commit SHA, reviewed patch SHA256, changed files, executed commands/results, limitations and next authorization in a new reviewable document. Arena.ai may review GitHub files and patches without terminal access. Do not message others or publish without authorization.
