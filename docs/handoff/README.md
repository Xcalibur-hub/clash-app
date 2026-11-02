# CLASH continuity handoff

This is a documentation-only handoff for a new ChatGPT account or collaborator.

Read in order:
1. PROJECT_HANDOFF.md — product, architecture, engineering history and active checkpoint.
2. PRODUCT_UNIFICATION_YC.md — recommendation for connecting Arena, Vault, Groups and the rest around one event loop.
3. NEXT_CHATGPT_INSTRUCTIONS.md — copy/paste startup instructions.
4. LAST_CLAUDE_PROMPT_B5D.md — exact last Claude task; its output was pending at handoff time. Do not resend it automatically.

## Important source-control distinction

This branch is documentation-only. At handoff preparation, GitHub's remote arena-ui-review branch was at 0cd6c36aa4831cda115c293b74ba2bf98c6d22df (October 24, 2026). The latest locally reported frontend freeze was 2b898748a48e317ac5737da62c7a964f50aca2a8, and GitHub did not contain that local commit when checked. Do not claim that this handoff branch includes the newer local application code.

## Privacy

The repository is public. This handoff excludes credentials, tokens, DPAPI stores, owner identifiers, private runtime state, exact disposable Docker IDs, raw environments and private .expo evidence. Use the original local reports to verify exact resource identities when needed. Never upload secret stores or production user data to ChatGPT or GitHub.
