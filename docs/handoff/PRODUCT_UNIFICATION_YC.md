# CLASH — unify Arena, Vault and the wider product

A YC contact said Arena and Vault look like two separate apps combined, suggesting CLASH is trying to fit too much into one product. Treat this as useful product-clarity feedback, not a universal YC rule.

## 1. One product, one central object

The fix is not merely adding a points balance. A universal currency over disconnected features would add complexity without creating coherence.

Make a **creator/community event** the central product object:

> Creators launch participatory events. Fans influence what happens. Communities organize around those events. Outcomes create reputation and creator-approved follow-up access.

An event should carry its host, prompt, format, timeline, audience, participant roles, eligibility, moderation policy, state, authoritative result, contribution receipts and optional rewards.

Formats can include:
- Duel: two fighters debate or compete; spectators vote or assist.
- CHOICE: creator asks the audience to choose between defined options.
- Skill challenge: users submit a solution or performance.
- Interactive Live: audience decisions influence an ongoing experience.

These are formats around one event model, not separate products with isolated identities and point systems.

## 2. How each area contributes

| Area | Unified job |
|---|---|
| Home / Explore | Discover relevant events and creator/community updates |
| Arena | Debate, duel, vote, assist, submit and verdict formats |
| Vault | Creator identity, content, membership, event follow-up and rewards |
| Groups | Coordinate fans, rally members, track collective progress |
| Live | Real-time event format and shared audience decisions |
| Play | Skill/game formats attached to an event |
| World | Optional physical/local extension of an event |

The UI may retain Arena and Vault destinations, but event discovery, creator identity, participation history and outcomes should connect them.

## 3. One repeatable loop

1. Creator creates an event in Studio/Vault with a prompt, format, duration, eligibility and optional creator-approved perk.
2. Home/Explore surfaces it to relevant followers and communities.
3. Fans join and see whether they can fight, vote, submit, assist or watch.
4. Groups rally members and pursue collective contribution milestones. In an Arena duel there are still exactly two fighters.
5. The server records authorized actions and computes the authoritative outcome.
6. Meaningful participation creates a contribution receipt and can build reputation.
7. Vault delivers the creator's follow-up: reaction, behind-the-scenes clip, Q&A, early access, event badge or other explicit perk.
8. The next event is suggested with context from the creator/community relationship.

Creators host because fans participate; fans return because they influence something and gain recognition; groups organize because collective effort matters; Vault gives creators a durable follow-up/relationship layer.

## 4. Reputation, points and rewards

Start simply. Avoid a financialized token economy as the first fix for product fragmentation.

**Reputation / XP**
- Non-cash, non-transferable and not purchasable.
- Represents meaningful contribution, consistency and sportsmanship.
- May unlock status or eligibility where useful.
- Never increases voting weight, gives pay-to-win advantage or overrides moderation.

**Creator-approved perks**
- Explicitly offered by the creator for an event or membership.
- Examples: event badge, free bonus clip, behind-the-scenes reaction, group Q&A, early access or ability to suggest a future topic.
- Must have clear eligibility, quantity, expiry and redemption rules.
- Must not silently grant paid subscriptions or imply cash value.

Group privileges can include milestone badges, priority to suggest events, group Q&A, special event themes or a limited creator-approved follow-up. Count distinct eligible members, apply cooldowns and anti-sybil/moderation checks. Do not reward raw views, spam or repeated low-value taps.

Conceptually, reputation is earned status; a perk is a specific entitlement the creator offers. Do not collapse them into a tradable coin just to connect tabs.

## 5. Suggested MVP

Prove one end-to-end event loop before redesigning every pillar.

**MVP event:** creator-hosted CHOICE or 1v1 debate with an audience vote.

1. Creator creates one event.
2. Fans discover it in Home/Explore.
3. Two people duel or the audience votes.
4. Groups rally and can earn a collective event milestone.
5. Server returns authoritative results and contribution receipts.
6. Creator publishes a Vault follow-up for eligible participants.
7. Users receive the next-event invitation.

Run a small initial cohort with a few creators and engaged fans. Measure invite-to-join conversion, meaningful contribution, seven-day next-event return, creator repeat-hosting, group participation lift and moderation cost. Treat any targets as experiments, not traction.

## 6. YC narrative

Suggested one-line description:

> CLASH lets creators run participatory challenges where fans compete, vote and help shape a shared outcome; participation builds reputation and brings communities back for the next event.

Suggested explanation:

> Most creator platforms are optimized for watching and commenting. CLASH gives creators a repeatable way to turn their audience into participants. Fans can compete, vote or assist; groups rally around them; and each event ends with an outcome and creator-led follow-up. We are starting with one tightly scoped challenge format and measuring whether fans return for the next event.

Be accurate about maturity. At the November 2, 2026 checkpoint, Creator Live frontend work is source-frozen and source-tested, but the first real PostgreSQL-backed shared event has not been validated. Do not claim production payments, real Live hosting or multi-actor acceptance without later evidence.
