You are a senior React Native engineer, product designer, motion designer, and startup MVP architect.

Build a polished mobile application called **CLASH 2.0**.

CLASH is a social platform built around short-lived debates called **Takes**, competitive **Clashes**, reputation, creator monetization, and sponsor attribution.

The application must feel like a premium startup product, not a coding demo.

The prototype must be fully navigable and functional using local/mock data first, while being architected so Supabase, authentication, payments, analytics, moderation, and external APIs can be connected later without rewriting the application.

==================================================

1. PRODUCT THESIS
   ==================================================

CLASH has two distinct product realms.

REALM 1 — THE 24H ARENA

* Fast-moving social content
* Takes disappear after 24 hours
* Daily Drop at 9:00 PM
* Users challenge opinions and participate in Clashes
* A 9-person jury determines outcomes
* Winners gain Reputation / Coins / Rank
* Exceptional Clashes enter the permanent Hall of Fame
* Communities are organized into local/social "Hoods"

REALM 2 — THE VAULT

* Creator-focused monetization
* Public Drops
* Exclusive Drops
* Mock microtransactions initially
* Sponsor campaigns
* Coupon tracking
* Sales analytics
* City-level attribution visualization
* Premium advertiser analytics

The two realms must feel visually and psychologically different while still belonging to the same brand.

==================================================
2. PRIMARY UX PRINCIPLE
=======================

Do NOT make this feel like Reddit + disappearing posts.

The HERO interaction is:

TAKE
→ CLASH
→ JUDGEMENT
→ RESULT
→ REPUTATION

Every major screen should reinforce this loop.

The user should understand the product within the first 10 seconds.

==================================================
3. TECH STACK
=============

Use:

* React Native
* Expo
* TypeScript
* Expo Router
* React Native Reanimated
* React Native Gesture Handler
* Expo Haptics
* AsyncStorage
* Lucide React Native icons or another clean vector icon library
* SVG support where useful
* Linear gradients where appropriate

Architecture must be modular.

Suggested structure:

app/
_layout.tsx
index.tsx
(arena)/
(vault)/
clash/
profile/
hall-of-fame/
settings/

components/
arena/
clash/
vault/
profile/
shared/
animations/

data/
mockTakes.ts
mockUsers.ts
mockClashes.ts
mockCreators.ts
mockSponsors.ts
mockAnalytics.ts

hooks/
services/
store/
utils/
theme/

Use reusable components rather than putting everything into one screen.

==================================================
4. DESIGN SYSTEM
================

Visual direction:

Apple-inspired premium dark UI with a "Liquid Glass" aesthetic.

Primary background:

#08080B

Use:

* translucent frosted cards
* blurred glass surfaces
* subtle gradients
* soft borders
* large rounded corners
* layered depth
* minimal shadows
* high-quality typography
* generous spacing
* smooth transitions

The design must NOT look like a generic SaaS dashboard.

Arena should feel:

* energetic
* chaotic
* social
* slightly rebellious
* playful

Vault should feel:

* premium
* controlled
* sophisticated
* commercial
* data-driven

Use subtle hand-drawn vector doodles:

* stars
* bursts
* arrows
* scribbles
* circles
* underline marks

Do NOT overcrowd the interface with doodles.

The doodles should feel like subtle editorial annotations in the background.

Use a typography hierarchy similar to:

Display:
32–40 px

Section:
22–28 px

Card title:
16–19 px

Body:
14–16 px

Metadata:
11–13 px

Make the app visually resemble a premium consumer product.

==================================================
5. APP ENTRY
============

Create an elegant startup splash/loading screen.

Show:

CLASH

small subtitle:

"Make a take. Start a clash."

Use a subtle animated logo.

After loading, transition into the Arena.

If first launch, show a minimal onboarding sequence with 3 screens:

1.

"Say what everyone is thinking."

2.

"Clash with people who disagree."

3.

"Build your reputation."

Allow:

GET STARTED

==================================================
6. MAIN ARENA
=============

Create a home screen called:

THE ARENA

Top section:

CLASH
[profile avatar]

Headline:

"Today's internet is arguing."

Below this:

Hood selector

Examples:

For You
TechTakes
CampusHustle
GoaTalk
Movies
Gaming

Main feed uses vertically scrollable Take cards.

Each Take card contains:

* creator avatar
* username
* reputation rank
* Hood
* time remaining
* text Take
* optional image
* optional short-video thumbnail
* number of clashes
* number of reactions
* CTA

Primary CTA:

CLASH

Secondary actions:

Share
Save
More

Example Take:

"Android flagships have officially caught up with iPhone."

Then show:

🔥 18 Clashes
2h 41m left

CLASH

Cards should feel interactive.

Use haptic feedback on important interactions.

==================================================
7. TAKE CREATION
================

Create a polished Create Take screen.

Fields:

WHAT'S YOUR TAKE?

Text input.

Optional:

* add image
* add video
* choose Hood

Character counter.

Bottom CTA:

DROP IT

When submitted:

* add the Take to local state
* show success animation
* award small Reputation/Coins
* return to Arena

A Take automatically expires after 24 hours in the mock system.

==================================================
8. CLASH SCREEN
===============

This is the most important screen in the application.

Make it exceptional.

Header:

CLASH

Display the original Take.

Example:

@maya

"Pixel takes better photos than the iPhone."

Then opposing response:

@liam

"Photos aren't the whole story. iPhone still dominates video."

Visually show:

TAKE A
vs
TAKE B

Then show:

WHAT DO YOU THINK?

Primary options:

A
B

Optional:

UNDECIDED

Use large animated interaction cards.

When user chooses:

* haptic feedback
* animation
* brief confirmation
* prevent repeated voting

Then show:

"Your judgement has been recorded."

Do not immediately reveal the global result before the appropriate state.

==================================================
9. 9-JUROR SYSTEM
=================

Mock the judging engine.

Every completed Clash should have:

9 jurors

Example:

TAKE A     6
TAKE B     3

Display:

9-PERSON JURY

6 — 3

Jury selection should be represented as randomized mock data.

DO NOT implement real device fingerprinting in this prototype.

Create a service layer that can later be replaced with a backend anti-abuse system.

Example service:

juryService.ts

Functions:

selectJurors()
submitJudgement()
calculateResult()

Keep these modular.

==================================================
10. RESULT EXPERIENCE
=====================

Create a strong result animation.

Example:

CLASH WON

A

6 — 3

+120 REPUTATION
+40 CLASH COINS

Then show:

YOUR RANK

"Rising Fire"

Animate the reputation number increasing.

Make this moment satisfying.

Use:

* haptic feedback
* particles
* subtle glow
* scale animation

Avoid excessive confetti.

==================================================
11. REPUTATION SYSTEM
=====================

Create fictional rank progression.

Example:

Rookie
Instigator
Hot Take
Firestarter
Provocateur
Clash King / Clash Queen
Legend

Use Reputation XP.

Example:

Winning Clash:
+120 XP

Participating:
+15 XP

Creating popular Take:
+30 XP

Entering Hall of Fame:
+500 XP

Coins are strictly virtual reputation/status points.

DO NOT create a real-money cashout system.

==================================================
12. DAILY DROP
==============

Create a dedicated screen:

9:00 PM DAILY DROP

This is the curated collection of the day's best Clashes.

Header:

TONIGHT'S CLASHES

Cards:

#01
"Are AI-generated videos already better than Hollywood trailers?"

#02
"The campus degree is becoming obsolete."

#03
"iPhone users pay too much for the same experience."

Each card has:

* thumbnail
* clash title
* participants
* jury result
* winning side
* current engagement
* Hood

Use a countdown until the next Daily Drop.

Mock current time logic can be used.

==================================================
13. HALL OF FAME
================

Create a permanent archive.

Header:

HALL OF FAME

Subtitle:

"Some takes don't deserve to disappear."

Display legendary Clashes.

Each contains:

* title
* winner
* creator
* jury score
* date
* Hood
* views
* shares

Allow opening the Clash.

This should feel like a digital museum/archive rather than a normal feed.

Include share functionality.

==================================================
14. HOODS
=========

Create a discovery/community screen.

Examples:

GoaTalk
CampusHustle
TechTakes
FootballHotTakes
Movies
Startups
Gaming
Design
College Life

Each Hood has:

* icon
* name
* member count
* active Clashes
* trending Take

Show:

TRENDING IN GOA

for the GoaTalk example.

Use mock geographic/community data.

==================================================
15. PROFILE
===========

Create a premium user profile.

Display:

Avatar

@username

Rank:
Firestarter

Reputation:
8,420

Clashes:
84

Wins:
51

Win Rate:
61%

Hall of Fame:
4

Current streak:
7

Tabs:

Takes
Wins
Hall of Fame

Include a reputation progress bar.

Show badges such as:

🔥 10 WIN STREAK
🏆 HALL OF FAME
⚡ EARLY ADOPTER

==================================================
16. REALM SHIFT
===============

The transition from Arena to Vault is a signature interaction.

Create a full-screen animated portal.

When switching realms:

Arena UI contracts/fades.

Glass portal expands.

The visual language becomes cleaner and more premium.

Then reveal:

THE VAULT

This must feel like entering another world.

Use Reanimated.

Do not make the transition slow.

Target approximately 500–800ms.

==================================================
17. VAULT HOME
==============

Header:

THE VAULT

Subtitle:

"Where influence becomes value."

Display creator cards.

Each creator has:

* avatar
* creator name
* reputation
* followers
* public drops
* exclusive drops

Sections:

TRENDING CREATORS

EXCLUSIVE DROPS

SPONSOR RADAR

==================================================
18. CREATOR PROFILE
===================

Creator profile should have two content tiers.

PUBLIC DROPS

These are freely accessible.

EXCLUSIVE DROPS

These are locked.

Example:

"How I actually grew to 100K followers"

LOCKED

₹49

UNLOCK

The price is mock only.

==================================================
19. MOCK PAYMENT FLOW
=====================

Do NOT implement real UPI payments yet.

Build a realistic simulated checkout.

When user taps:

UNLOCK FOR ₹49

show:

UPI
PhonePe
Google Pay
Other UPI

Then:

PAY ₹49

Simulate payment success.

Show:

✓ UNLOCKED

The backend should expose an abstraction such as:

paymentService.ts

with:

createPayment()
confirmPayment()
unlockContent()

Later this can be connected to a real payment provider.

==================================================
20. SPONSOR RADAR
=================

This is one of the most important screens.

Create:

SPONSOR RADAR

Example campaign:

Creator:
@TechWithMaya

Sponsor:
Nova

Campaign:
NOVOCAINE20

Display:

Clicks
12,842

Redemptions
1,281

Attributed Orders
1,034

Estimated GMV
₹8.4L

Conversion
8.1%

Then show:

TOP CITIES

Goa       34%
Mumbai    27%
Bangalore 18%
Delhi     9%
Other     12%

Create an elegant city visualization.

It can be a stylized map-like visualization using SVG or another lightweight approach.

For the prototype, use mocked data.

Do NOT claim that the prototype has real offline transaction verification.

Label the data clearly as:

SIMULATED CAMPAIGN DATA

==================================================
21. PREMIUM GEO ATTRIBUTION
===========================

Create a premium advertiser insight screen.

Header:

REGIONAL INFLUENCE

Show:

"Where your creator actually converts."

Include:

* city distribution
* orders
* coupon redemptions
* creator
* campaign
* time period

Have a locked premium section:

ADVANCED GEO ATTRIBUTION

Button:

UNLOCK ANALYTICS

When tapped, display a mock paywall:

PRO ANALYTICS

₹19,999 / month

Includes:

City-level attribution
Regional performance
Campaign comparison
Conversion analysis
Exportable reports

Use mocked values.

==================================================
22. SPONSOR DASHBOARD
=====================

Create a sponsor-facing dashboard.

Navigation:

Overview
Campaigns
Creators
Attribution

Overview shows:

Revenue
Orders
Conversions
Top Creator
Top City

Campaign screen shows:

NOVOCAINE20

Status:
ACTIVE

Clicks:
12,842

Redemptions:
1,281

Conversion:
8.1%

Creator screen ranks creators by campaign performance.

Do NOT present these metrics as real-world verified transactions.

Use clearly marked simulated prototype data.

==================================================
23. BOTTOM NAVIGATION
=====================

Arena navigation:

Home
Discover
Create
Notifications
Profile

Vault navigation can use:

Home
Creators
Radar
Analytics
Profile

The realm switch should replace the visual navigation style rather than creating a confusing number of tabs.

==================================================
24. MICRO-INTERACTIONS
======================

Use animation throughout the app.

Examples:

* card press scale
* glass blur transitions
* tab transitions
* reputation number animation
* XP progress animation
* winner reveal
* portal transition
* modal spring animations
* haptic feedback
* button press states
* pull-to-refresh
* skeleton loading

Animations should be subtle and premium.

Avoid gimmicky animations.

==================================================
25. EMPTY STATES
================

Every major section needs a polished empty/loading state.

Example:

"Nothing is clashing here yet."

CTA:

START THE FIRST CLASH

==================================================
26. MOCK DATA
=============

Create enough mock data to make the application feel alive.

At minimum:

25 Takes
15 Users
12 Clashes
8 Hoods
6 Creators
5 Exclusive Drops
4 Sponsors
5 Campaigns
City analytics data
Notification data

Use believable Indian creator names, cities and rupee values.

Use Goa, Mumbai, Bangalore, Delhi, Pune, Hyderabad and Chennai in the mock datasets.

Avoid hardcoding data directly inside UI components.

Store mock data in separate files.

==================================================
27. STATE MANAGEMENT
====================

Use a lightweight state management architecture.

Local state is acceptable.

Use AsyncStorage for:

* user profile
* reputation
* created Takes
* completed Clashes
* unlocked Drops
* onboarding completion
* selected Hood

The app should retain important prototype actions after reload.

==================================================
28. BACKEND-READY ARCHITECTURE
==============================

Create clean service abstractions.

For example:

authService.ts
clashService.ts
juryService.ts
takeService.ts
paymentService.ts
creatorService.ts
sponsorService.ts
analyticsService.ts
moderationService.ts

Initially these services use mock/local implementations.

Keep interfaces clean so a future Supabase implementation can replace them.

==================================================
29. FUTURE SUPABASE SCHEMA
==========================

Create a documentation file describing a future Supabase schema containing:

users
profiles
takes
clashes
judgements
jury_assignments
reputation_events
hall_of_fame
hoods
hood_members
creators
exclusive_drops
purchases
sponsors
campaigns
coupon_redemptions
attribution_events
notifications
moderation_reports

Do not require Supabase for the initial prototype.

==================================================
30. MODERATION
==============

Create the UI foundations for moderation.

Every Take and Clash should have:

More (...)

Options:

Report
Mute
Block

Create mock moderation categories:

Harassment
Hate
Threat
Spam
Impersonation
Other

Do not attempt to implement a complete production moderation system.

Create a service abstraction.

Use the product principle:

"Roast the Take, not the human."

Do not automatically claim legal compliance in the app.

Create documentation explaining that actual platform legal/compliance implementation must be reviewed separately before production launch.

==================================================
31. ANTI-ABUSE ARCHITECTURE
===========================

Create a conceptual anti-abuse service layer.

Track:

user ID
session ID
device identifier placeholder
cooldown
jury assignment

But DO NOT implement invasive fingerprinting.

Create comments describing where production anti-abuse infrastructure would be integrated.

==================================================
32. NOTIFICATIONS
=================

Create a notification center.

Examples:

🔥 Your Clash just entered the Daily Drop.

🏆 You won your Clash 6–3.

⚡ You are 80 XP away from Firestarter.

👑 Your Take entered the Hall of Fame.

💰 @maya uploaded a new Exclusive Drop.

Do not overuse push notification permissions in the prototype.

==================================================
33. SHARING
===========

Add share buttons to:

* Hall of Fame Clashes
* winning results
* creator drops

For prototype purposes, use the native share API where practical or provide a mock share action.

The share preview should visually resemble:

CLASH

"This take survived."

[Take]

6 — 3

HALL OF FAME

==================================================
34. ACCESSIBILITY
=================

Use:

* accessible labels
* sufficient touch targets
* scalable text where practical
* semantic buttons
* reduced-motion considerations

Do not sacrifice visual quality.

==================================================
35. PERFORMANCE
===============

Optimize FlatLists.

Do not unnecessarily re-render the entire feed.

Do not load large assets repeatedly.

Use memoization where helpful.

Keep animations on the UI thread when possible.

==================================================
36. ERROR HANDLING
==================

Create polished error states.

Examples:

Unable to load Clashes.

Try again.

Payment simulation failed.

Try again.

Do not expose raw stack traces to users.

==================================================
37. FINAL PRODUCT QUALITY
=========================

The app must satisfy these requirements:

* no placeholder screens
* no obvious lorem ipsum
* no empty navigation routes
* no broken buttons
* no console errors
* no TypeScript errors
* no missing imports
* no fake implementations presented as production functionality
* no giant monolithic component
* reusable components
* clean folder structure

Every interactive button must either perform an action or intentionally display a prototype state.

==================================================
38. IMPORTANT PRIORITY ORDER
============================

Build in this order:

PHASE 1
Navigation
Theme
Arena
Take cards
Clash screen
Judgement
Result
Profile

PHASE 2
Daily Drop
Hall of Fame
Hoods
Realm Shift
Vault

PHASE 3
Creator profiles
Exclusive Drops
Mock checkout
Sponsor Radar
Analytics
Geo attribution visualization

PHASE 4
Persistence
Polish
Animations
Error states
Accessibility
Performance

==================================================
39. VISUAL PRIORITY
===================

Spend extra design effort on these five screens:

1. Arena home
2. Clash battle screen
3. Clash result
4. Realm Shift
5. Sponsor Radar

These are the screens that should look exceptional in a demo.

==================================================
40. DEVELOPMENT PROCESS
=======================

Do not attempt to generate the entire application in one giant file.

Build incrementally.

After each major feature:

* run TypeScript checks
* resolve import errors
* resolve navigation issues
* verify the screen works
* inspect spacing
* verify animations
* verify button states

Keep the project runnable after every step.

When something fails, diagnose and fix it rather than leaving TODO placeholders.

==================================================
41. README
==========

Create a README explaining:

* how to install
* how to run
* architecture
* current mock-data implementation
* future Supabase integration
* future payment integration
* future anti-abuse implementation
* future sponsor attribution implementation

Clearly distinguish:

PROTOTYPE FUNCTIONALITY

from:

FUTURE PRODUCTION INFRASTRUCTURE

==================================================
42. FINAL RESULT
================

The finished prototype should feel like a real startup called:

CLASH

Tagline:

"MAKE YOUR TAKE."

The emotional sequence should be:

Curiosity
→ disagreement
→ participation
→ suspense
→ result
→ reputation
→ return tomorrow

The Arena should feel energetic.

The Vault should feel premium.

The transition between them should feel memorable.

The application should be impressive enough for:

* startup demos
* investor presentations
* campus testing
* creator demos
* early user testing

Do not build a generic social-media clone.

Build CLASH as a distinctive product with its own interaction language.
