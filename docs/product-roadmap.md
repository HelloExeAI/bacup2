# Product vision & roadmap (founder brainstorm)

Authoritative narrative for **V1 / V2 / V3+** and feature themes. Read this when prioritizing work, naming surfaces, or scoping “premium” vs core.

---

## Release narrative (stack rank)

**V1:** Morning brief + decision queue + project cards + role homes + delegation for EA + strict email policy (as defined in product).

**V2:** Playbooks / recurring programs, dependency map, meeting OS, security center. *(Shipped in-app: Business OS workspace + Settings → Security; see migration `20260410120000_workspace_v2_playbooks_dependencies_meetings.sql`.)*

**V3+:** Deep stakeholder / investor rhythms, advanced workload SLAs, richer WhatsApp.

---

## Founder automation (high leverage)

- **Morning brief (5-minute mode)** — One screen: top 5 decisions, blockers, calendar landmines, team overload signals, “only you can do” items. Regenerates when data changes; always shows **why** each item is there.

- **Decision queue** — Decisions waiting on the founder with prep: options, tradeoffs, who’s blocked, suggested next step. Age the queue (stale decisions = risk).

- **Escalation router** — Clear rules: what goes to founder vs EA vs manager; auto-suggest assignee from org chart. Reduces “everything pings the founder.”

- **Weekly founder memo (auto-draft)** — What shipped, what slipped, top risks, cash/runway reminders if you have data, team capacity snapshot. Founder edits; becomes the leadership narrative.

- **Meeting OS** — Before: agenda + decisions needed. After: decisions + tasks + owners + due dates (no storing raw email; tie-outs to calendar). Optional later: voice capture.

- **Stakeholder / investor rhythm** — Templates for update emails, metrics packs, board prep checklists—generated from tasks + milestones, not from inbox archives.

---

## Team & execution automation

- **Workload & WIP governance** — WIP limits, “at risk” by dependency age and blocked time, not just task count. Managers get intervention suggestions, not dashboards only.

- **Project health cards** — Goal, owner, next milestone, top 3 blockers, last human update timestamp. AI suggests updates, humans approve (trust).

- **Cross-team dependency map** — “Team A is waiting on Team B” as a first-class object; nudges and SLA-style visibility (optional, premium).

- **Recurring / playbook engine** — Launch, fundraise, hiring sprint, month-close: templates that spawn tasks, reviews, and calendar holds.

- **Role-based home screens** — Founder vs EA vs Manager vs Associate each get one primary job on open, not the same clutter.

---

## Communication automation (fits privacy model)

- **Outbox for sensitive channels** — Anything that could send email/Slack/WhatsApp sits behind review + confirm; audit log of what was sent, when, by whom.

- **EA delegation scopes** — Fine-grained: see tasks derived from founder mail vs not, see calendar only, approve sends, etc. Plain-language permission strings (“Can prepare drafts, cannot send”).

- **WhatsApp (when added)** — Same philosophy: extract actions, minimal retention, consent, org visibility rules—parity with email task extraction.

---

## Trust, speed, “premium” (product features, not polish only)

- **Freshness & provenance everywhere** — “From calendar 2m ago,” “from task you created,” “inferred—confirm.” Builds trust faster than smarter copy.

- **Explainability toggle** — Short/long: busy founders see one line; detail mode shows evidence chain (still no email body in DB).

- **Correction memory (opt-in)** — “That owner guess was wrong” / “Never tag this as urgent” improves AI without feeling rude or surveillance-y.

- **Performance as a feature** — Cached shells, stale-while-revalidate, scoped fetches (bounded email mindset extended to everything).

- **Security center** — One place: connected accounts, what each integration can read, retention, export/delete, EA access summary. Founders buy peace of mind.

---

## Moat-style differentiation (harder to copy)

- **Operating cadence built-in** — Not task app; weekly operating rhythm (priorities, reviews, risks, capacity) with gentle enforcement.

- **Founder-specific leading metrics** — Decision latency, escalation backlog, dependency aging, calendar fragmentation—metrics that map to how the founder works, not generic “tasks completed.”

- **Human-in-the-loop by default for AI actions** — Premium positioning: automation proposes, humans commit—especially for external comms and priority changes.

---

*Captured from founder brainstorm session; treat as directional product truth when in doubt.*
