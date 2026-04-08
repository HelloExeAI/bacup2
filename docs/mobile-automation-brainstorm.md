# Mobile app & automation — brainstorm (living doc)

**Status:** Work in progress. Continue brainstorming here and **finalize decisions while building the mobile app**. Link concrete API/UX choices back to [`product-roadmap.md`](product-roadmap.md) when they ship.

---

## North star

Aim for **minimum meaningful interaction**: the system triages, synthesizes, and routes so the founder **confirms, rejects, or re-prioritizes**—not “zero judgment forever,” but **near-zero friction** for everything that does not need founder judgment.

---

## Layers of automation

| Layer | Runs without the founder | Founder’s role |
|--------|---------------------------|----------------|
| **Ingest** | Email / calendar / tasks / chat → normalized events + suggested actions | Usually nothing |
| **Interpret** | Rank, dedupe, link to people/projects, detect conflicts | Rare: fix wrong bucket |
| **Route** | EA / manager / system get the right subset | Configure rules once |
| **Act** | Drafts, calendar holds, reminders, playbook steps | Approve sends and high-stakes moves |
| **Learn** | Remember corrections (“never urgent from X”) | Occasional short feedback |

The mobile app should excel at **layers 2–4 in one glance**: what matters, what we did, what needs you.

---

## Mobile-first IA (founder opens app once)

1. **Today / Now** — 3–7 cards max: decisions waiting, time-sensitive items, “only you” items, EA-blocked items. Each card: **one-line thesis + why it’s here** (provenance / explainability).
2. **Approve** — Outbound drafts, sensitive calendar moves, external comms. **Batch approve** where policy allows.
3. **Delegate** — Hand off to EA with a **context bundle** (not raw inbox dumps).
4. **Digests** — Weekly memo, dependency aging, playbook progress — **read-only by default**, expandable.

Secondary flows deep-link from notifications; avoid cloning the full web product on a phone.

---

## Push & interruption strategy

- **Tier A — Interrupt:** Legal/security, hard calendar conflicts, deadlines &lt; 24h with no clear owner.
- **Tier B — Batched:** Fixed digest times (e.g. morning / midday / end of day) or “unlock summary.”
- **Tier C — Silent in app:** No push unless the user opts in per category.

Run **rules on the server** (not only on device): e.g. if confidence &lt; threshold, or amount &gt; cap, or external domain → **require explicit approval** so automation does not cross lines silently.

---

## Automation loops that feel “zero work”

- **Morning brief** — Server-generated; push: “Brief ready.” Same cards offline-friendly where possible.
- **Decision queue** — Pre-filled options / tradeoffs; founder **A / B / defer** (minimal taps).
- **Playbooks** — Steps complete when integrations or signals confirm; ambiguous steps surface for humans.
- **Meeting OS** — Structured capture (e.g. voice → bullets → action items) without storing raw email; founder approves task creation.
- **EA buffer** — EA clears noise on desktop/web; mobile emphasizes **escalations + weekly trust metrics** for the founder.

---

## System design (directional)

- **Event bus** — Sources emit normalized events with retention and consent metadata.
- **Unified work item** — Decisions, tasks, approvals, risks share one list model for mobile.
- **Policy store** — Founder + org rules: who may approve what, caps, domains, quiet hours.
- **Mobile client** — Primarily **read + approve + delegate**; heavy authoring can stay web initially.
- **Trust / audit** — Log: *Proposed → Approved → Executed* with timestamps for external actions.

---

## Constraints (product truth)

- **Irreversible or regulated actions** (money, legal, broad external comms): keep **human-in-the-loop** or **EA-with-mandate**, not silent autopilot.
- **“Founder does nothing”** is realistic for **consumption and pre-staged actions**; for **judgment**, win by **one gesture per decision**, not by removing feedback forever.

---

## Open questions (fill in as you decide)

- What may happen with **zero taps** vs **one tap** vs **typed reply**?
- If the founder only opens the phone **twice a day**, what is the **single highest-value push**?
- **EA vs founder** on mobile: how do we prevent duplicate pings and split responsibility clearly?
- What **3-second correction UX** on mobile trains the system without feeling like surveillance?

---

*Last captured from founder/product brainstorm session; extend with dated entries as you refine.*
