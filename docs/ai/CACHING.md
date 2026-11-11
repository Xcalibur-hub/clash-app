# CACHING — DeepSeek Prompt Cache Behaviour

How prompt caching works for this workspace's active model, what was measured,
and how to spend fewer tokens. Determined by reading the installed adapter
source and this session's own durable log — no billed test request was made.

---

## 1. Active route

| Fact | Value | Source |
|---|---|---|
| Harness provider id | `aicredits` | `~/.dsh/profiles/desktop/cordis.patch.yml` |
| Model id | `deepseek/deepseek-v4.1-flash-1017` | same |
| Wire protocol | `openai-completions` | same (`api:`) |
| Base URL | `https://aicredits.in/v1` | same |
| Context window | 1,048,576 tokens | derived from the session's `request/context` record |
| Credential | referenced by env-var name only | never printed; not reproduced here |

## 2. Is caching automatic or configured?

**Automatic — no configuration required.** Verified in
`@earendil-works/pi-ai/dist/api/openai-completions.js`:

- `resolveCacheRetention(cacheRetention, env)` returns the configured value, else
  `PI_CACHE_RETENTION === "long"`, else **`"short"`** by default.
- `prompt_cache_key` is sent **only** when the base URL contains `api.openai.com`
  or when retention is `long` *and* the route declares long-cache support.
  Neither applies to `aicredits.in`, so no cache key or retention field is sent —
  DeepSeek caches prefix-matched prompts server-side on its own.

**Conclusion:** CLASH already gets prompt caching with zero configuration.

## 3. Does the provider report cached tokens?

**Yes.** The usage parser reads, in order of precedence:

```text
prompt_tokens_details.cached_tokens  ??  prompt_cache_hit_tokens  ??  cached_tokens
```

`prompt_cache_hit_tokens` is DeepSeek's own field and is explicitly handled.
Writes come from `prompt_tokens_details.cache_write_tokens`.

Critically, the adapter computes:

```text
input = prompt_tokens − cacheRead − cacheWrite
```

So the Harness's recorded `inputTokens` are **already cache-excluded**. Total
prompt size is `inputTokens + cacheReadTokens`.

## 4. Does the Harness expose usage and cache statistics?

**Yes.** `TokenUsage` carries `inputTokens`, `outputTokens`, `cacheReadTokens`,
`cacheWriteTokens`, `reasoningTokens`. The `token-meter` plugin exposes
`tokenUsage` (aggregated `uncachedInputTokens`, `cacheReadTokens`,
`cacheWriteTokens`, `outputTokens`) plus `contextPressure`.

Per-request usage is persisted in the durable session log as
`assistant/message.data.usage`, so it can be audited offline at any time.

## 5. Is cached pricing reflected in billed usage?

**PARTIAL / NOT VERIFIED.**

- *Supported by the provider:* DeepSeek bills cache-hit input separately from
  cache-miss input at a lower rate, which is why it reports the two separate
  counters. Our requests do receive the hit counter.
- *Not visible here:* the Harness records **tokens**, not currency. No
  price-per-token is captured for this route, so the actual invoice cannot be
  reconstructed from local data. Cost below is illustrative only.

## 6. Measured statistics

Source: this session's durable log
(`~/.dsh/sessions/--<REPO_ROOT_SLUG>--/session-7ea82cdb-.../session.v4.jsonl.zstd`),
decompressed read-only and parsed locally.

- **116** assistant requests recorded, all under the `aicredits` route.
- **115 / 116** reported a non-zero cache read.

| Metric | Tokens |
|---|---|
| Total prompt tokens | 9,699,000 |
| — billed as fresh input (2.2%) | 211,256 |
| — served from cache (97.8%) | 9,487,744 |
| Output tokens | 45,499 |
| Cache write tokens | 0 |

**Cold vs. warm prefix (actual first two requests):**

| | Fresh input | Cache read | Output |
|---|---:|---:|---:|
| Request 1 (cold) | 9,347 | 1,664 | 150 |
| Request 2 (warm) | 2,310 | 11,136 | 377 |

**Cache-hit ratio by session quarter** — caching does *not* degrade as a
session grows; it improves, because the stable prefix is reused more:

| Segment | Fresh input | Cache read | Hit share |
|---|---:|---:|---:|
| Q1 (first 25%) | 44,327 | 975,488 | 95.7% |
| Q2 | 92,989 | 1,752,832 | 95.0% |
| Q3 | 30,107 | 2,790,656 | 98.9% |
| Q4 (last 25%) | 43,833 | 3,968,768 | 98.9% |

**The single miss (request 45):** 63,253 fresh input tokens, zero cache read.
It follows a provider switch in the session (`request/header` reason `change`).
A changed provider/model invalidates the reusable prefix by definition — this is
expected, not a defect.

### Illustrative cost — not a bill

At DeepSeek public list prices ($0.28 / MTok cache-miss input, $0.028 cache-hit,
$0.42 output), this session would cost roughly **$2.73 without caching** and
**$0.34 with it** — about 87% less on the prompt side. These are published list
prices, not AICredits' billing, and must not be quoted as an actual charge.

## 7. Limitations

- Measured from **one session on one route**. Other routes (`nvidia-nim`,
  `tokenharbour`) are separate and were not measured.
- Cache behaviour is provider-side; DeepSeek may evict entries at any time.
  A high historical hit ratio does not guarantee one.
- `cacheWriteTokens` was always 0 — this provider does not charge an explicit
  write, so there is no separate write cost to model.
- No billed test request was made. The comparison above uses real requests this
  session already issued.

## 8. Configuration recommendation

**Change nothing.** Current configuration already yields ~98% cache reuse.

Keep it that way by respecting these rules:

1. **Stable content first, variable content last.** System prompt → `AGENTS.md`
   / `CLAUDE.md` workspace instructions → tool definitions → conversation →
   the new user turn. All of these are already ordered correctly by the
   Harness; do not inject late-breaking context in a way that displaces the
   existing prefix.
2. **Do not edit `AGENTS.md` / `CLAUDE.md` mid-session.** The instruction
   baseline is appended once; a mid-session edit forces a re-render and a new
   suffix. Batch documentation edits to the start of a session.
3. **Do not switch provider or model mid-task.** Every switch is a guaranteed
   prefix miss — the one miss in this session cost 63k fresh tokens.
4. **Load docs on demand, not wholesale.** Only `AGENTS.md` + `CLAUDE.md` are
   auto-injected. `docs/ai/` is read on demand through `INDEX.md`. Never bulk-read
   `docs/evidence/`, entire logs, or full source trees — those bloat context
   without becoming reusable cache prefix on the next session.
5. **Never set `cacheRetention: "long"`** for this route. It would add
   `prompt_cache_retention: "24h"` only if the route declared long-cache
   support, which it does not — so it is a no-op at best and a prefix-changing
   variable at worst. Leave `PI_CACHE_RETENTION` unset.
6. **Prefer one long session over many short ones** for contiguous work: the
   first request of every new session is a cold miss (here: 9,347 fresh tokens
   before the cache engages).
