"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";
import { useUserStore } from "@/store/userStore";
import { useTaskStore } from "@/store/taskStore";
import { useEventStore } from "@/store/eventStore";
import type { SettingsPayload, TeamMemberSummary } from "@/modules/settings/types";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";
import { AutomateFollowups } from "@/modules/workspace/AutomateFollowups";
import { requestOverviewKpi, type OverviewKpiKind } from "@/modules/tasks/overviewKpiBus";
import { buildTodayActionBriefLines, ymdToday } from "@/modules/tasks/dayBriefing";
import { formatPersonWithDepartment } from "@/lib/workspace/departments";

type HubContext = {
  workspaceOwnerId: string;
  viewerRole: string;
  isFounder: boolean;
  isEa: boolean;
  eaPolicy: {
    can_view_email_derived_tasks: boolean;
    can_view_calendar_summary: boolean;
    can_view_decisions: boolean;
    can_view_projects: boolean;
    can_view_recognition_feed: boolean;
  } | null;
};

type DecisionRow = {
  id: string;
  title: string;
  context_notes: string | null;
  status: string;
  priority: number;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  requester_user_id: string;
  approver_user_id: string;
  template_type: string;
  title: string;
  status: string;
  currency: string | null;
  cost_total_cents: number | null;
  needed_by: string | null;
  decision_deadline: string | null;
  routing_reason: string | null;
  decision_note: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalTemplateType = "leave" | "travel" | "purchase";

function currencyFromCode(code: string | null | undefined) {
  const s = (code ?? "").trim().toUpperCase();
  return s || "USD";
}

function formatMoneyCents(cents: number | null | undefined, currency: string | null | undefined) {
  if (typeof cents !== "number") return null;
  const code = currencyFromCode(currency);
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amt);
  } catch {
    return `${code} ${amt.toFixed(2)}`;
  }
}

function approvalStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
    case "rejected":
      return "bg-red-500/15 text-red-900 dark:text-red-100";
    case "needs_changes":
      return "bg-amber-500/15 text-amber-950 dark:text-amber-100";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type OrgEdge = {
  id: string;
  report_user_id: string;
  manager_user_id: string;
  relation_rank: number;
};

function overviewGreeting(profile: {
  last_name?: string | null;
  display_name?: string | null;
  name?: string | null;
} | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const ln = profile?.last_name?.trim();
  if (ln) return `${part}, ${ln}!`;
  const fromDisplay = profile?.display_name?.trim().split(/\s+/).filter(Boolean).pop();
  if (fromDisplay && fromDisplay.length > 0) return `${part}, ${fromDisplay}!`;
  const fromName = profile?.name?.trim().split(/\s+/).filter(Boolean).pop();
  if (fromName) return `${part}, ${fromName}!`;
  return `${part}!`;
}

export function WorkspaceHub() {
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);
  const { openSettingsToTab } = useSettingsModal();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [ctx, setCtx] = React.useState<HubContext | null>(null);
  const [brief, setBrief] = React.useState<Record<string, number> | null>(null);
  const [decisions, setDecisions] = React.useState<DecisionRow[]>([]);
  const [approvals, setApprovals] = React.useState<ApprovalRow[]>([]);
  const [orgEdges, setOrgEdges] = React.useState<OrgEdge[]>([]);
  const [team, setTeam] = React.useState<TeamMemberSummary[]>([]);
  const [departmentByUserId, setDepartmentByUserId] = React.useState<Record<string, string>>({});

  const [followPendingApproval, setFollowPendingApproval] = React.useState(0);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [hubRes, settingsRes] = await Promise.all([
        fetch("/api/workspace/hub", { credentials: "include" }),
        fetch("/api/user/settings", { credentials: "include" }),
      ]);
      const hubJson = (await hubRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!hubRes.ok) {
        throw new Error(typeof hubJson?.error === "string" ? hubJson.error : "Failed to load workspace");
      }
      const c = hubJson?.context as HubContext | undefined;
      if (c) setCtx(c);
      const rawDept = hubJson?.departmentByUserId;
      setDepartmentByUserId(
        rawDept && typeof rawDept === "object" && !Array.isArray(rawDept)
          ? (rawDept as Record<string, string>)
          : {},
      );
      setBrief((hubJson?.morningBrief as Record<string, number>) ?? null);
      setDecisions((hubJson?.decisions as DecisionRow[]) ?? []);
      setOrgEdges((hubJson?.orgEdges as OrgEdge[]) ?? []);

      const fa = hubJson?.followAutomation as { pendingApproval?: number } | undefined;
      setFollowPendingApproval(typeof fa?.pendingApproval === "number" ? fa.pendingApproval : 0);

      const settingsJson = (await settingsRes.json().catch(() => null)) as SettingsPayload | null;
      if (settingsRes.ok && settingsJson?.teamMembers) {
        setTeam(settingsJson.teamMembers);
      }

      // Approvals list (MVP): fetched separately so hub can remain stable.
      try {
        const approvalsRes = await fetch("/api/workspace/approvals?view=all", { credentials: "include" });
        const approvalsJson = (await approvalsRes.json().catch(() => null)) as { approvals?: ApprovalRow[] } | null;
        if (approvalsRes.ok && Array.isArray(approvalsJson?.approvals)) {
          setApprovals(approvalsJson.approvals);
        } else {
          setApprovals([]);
        }
      } catch {
        setApprovals([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const isFounder = Boolean(user?.id && ctx?.workspaceOwnerId && user.id === ctx.workspaceOwnerId);

  const [newDecision, setNewDecision] = React.useState("");
  const [approvalCreateOpen, setApprovalCreateOpen] = React.useState(false);
  const [approvalTemplate, setApprovalTemplate] = React.useState<ApprovalTemplateType>("leave");
  const [approvalTitle, setApprovalTitle] = React.useState("");
  const [approvalJustification, setApprovalJustification] = React.useState("");
  const [approvalRisk, setApprovalRisk] = React.useState("");
  const [approvalNeededBy, setApprovalNeededBy] = React.useState("");
  const [approvalDeadline, setApprovalDeadline] = React.useState("");
  const [approvalCurrency, setApprovalCurrency] = React.useState("USD");
  const [approvalCost, setApprovalCost] = React.useState("");
  const [approvalLinks, setApprovalLinks] = React.useState("");
  const [approvalNotes, setApprovalNotes] = React.useState("");
  const [approvalApproverId, setApprovalApproverId] = React.useState("");

  // Leave template
  const [leaveType, setLeaveType] = React.useState("annual");
  const [leaveStart, setLeaveStart] = React.useState("");
  const [leaveEnd, setLeaveEnd] = React.useState("");
  const [leaveCoverage, setLeaveCoverage] = React.useState("");
  const [leaveUrgency, setLeaveUrgency] = React.useState("normal");

  // Travel template
  const [travelPurpose, setTravelPurpose] = React.useState("");
  const [travelFrom, setTravelFrom] = React.useState("");
  const [travelTo, setTravelTo] = React.useState("");
  const [travelDepartWindow, setTravelDepartWindow] = React.useState("");
  const [travelReturnWindow, setTravelReturnWindow] = React.useState("");
  const [travelTravelers, setTravelTravelers] = React.useState("");
  const [travelOptions, setTravelOptions] = React.useState("");

  // Purchase template
  const [purchaseItem, setPurchaseItem] = React.useState("");
  const [purchaseVendor, setPurchaseVendor] = React.useState("");
  const [purchaseRecurring, setPurchaseRecurring] = React.useState("one_time");
  const [purchaseCadence, setPurchaseCadence] = React.useState("");
  const [purchaseAlternatives, setPurchaseAlternatives] = React.useState("");

  const [decisionModalOpen, setDecisionModalOpen] = React.useState(false);
  const [decisionApproval, setDecisionApproval] = React.useState<ApprovalRow | null>(null);
  const [decisionNote, setDecisionNote] = React.useState("");
  const [decisionAction, setDecisionAction] = React.useState<"approved" | "rejected" | "needs_changes">("approved");

  const memberIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    for (const m of team) {
      if (m.member_user_id) ids.add(m.member_user_id);
    }
    if (ctx?.workspaceOwnerId) ids.add(ctx.workspaceOwnerId);
    return Array.from(ids);
  }, [team, user?.id, ctx?.workspaceOwnerId]);

  const displayName = (uid: string) => {
    if (uid === user?.id) return profile?.display_name?.trim() || profile?.name?.trim() || "You";
    const row = team.find((t) => t.member_user_id === uid);
    return row?.display_name?.trim() || uid.slice(0, 8) + "…";
  };

  const personLabel = (uid: string) =>
    formatPersonWithDepartment(displayName(uid), departmentByUserId[uid] ?? null);

  const defaultApproverId = React.useMemo(() => {
    const uid = user?.id;
    const ws = ctx?.workspaceOwnerId;
    if (!uid || !ws) return "";
    const matches = orgEdges.filter((e) => e.report_user_id === uid);
    if (matches.length === 1) return matches[0]?.manager_user_id ?? ws;
    return ws;
  }, [ctx?.workspaceOwnerId, orgEdges, user?.id]);

  React.useEffect(() => {
    if (!approvalCreateOpen) return;
    setApprovalApproverId((prev) => (prev ? prev : defaultApproverId));
  }, [approvalCreateOpen, defaultApproverId]);

  const submitApproval = async () => {
    const template_type = approvalTemplate;
    const title = approvalTitle.trim() || (() => {
      if (template_type === "leave") return "Leave request";
      if (template_type === "travel") return "Travel request";
      return "Purchase request";
    })();
    const justification = approvalJustification.trim();
    const risk = approvalRisk.trim();
    if (!justification || !risk) return;

    const links = approvalLinks
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 12);

    const costTotalCents = (() => {
      const s = approvalCost.trim();
      if (!s) return undefined;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.round(n * 100);
    })();

    const summary_json: Record<string, unknown> = {
      justification,
      risk_if_delayed: risk,
      links,
      notes_for_approver: approvalNotes.trim() || null,
    };

    const template_json: Record<string, unknown> = (() => {
      if (template_type === "leave") {
        return {
          leave_type: leaveType,
          start_date: leaveStart || null,
          end_date: leaveEnd || null,
          coverage_plan: leaveCoverage.trim() || null,
          urgency: leaveUrgency,
        };
      }
      if (template_type === "travel") {
        return {
          purpose: travelPurpose.trim() || null,
          origin: travelFrom.trim() || null,
          destination: travelTo.trim() || null,
          depart_window: travelDepartWindow.trim() || null,
          return_window: travelReturnWindow.trim() || null,
          travelers: travelTravelers.trim() || null,
          options: travelOptions.trim() || null,
        };
      }
      return {
        item_or_service: purchaseItem.trim() || null,
        vendor: purchaseVendor.trim() || null,
        billing_type: purchaseRecurring,
        cadence: purchaseCadence.trim() || null,
        alternatives_considered: purchaseAlternatives.trim() || null,
      };
    })();

    // Template required fields (MVP)
    if (template_type === "leave") {
      if (!leaveStart || !leaveEnd || !leaveCoverage.trim()) return;
    } else if (template_type === "travel") {
      if (!travelPurpose.trim() || !travelFrom.trim() || !travelTo.trim() || !travelDepartWindow.trim()) return;
    } else {
      if (!purchaseItem.trim() || !purchaseVendor.trim()) return;
    }

    const body = {
      template_type,
      title,
      needed_by: approvalNeededBy.trim() ? new Date(approvalNeededBy).toISOString() : undefined,
      decision_deadline: approvalDeadline.trim() ? new Date(approvalDeadline).toISOString() : undefined,
      currency: approvalCurrency.trim() || undefined,
      cost_total_cents: costTotalCents,
      summary_json,
      template_json,
      approver_user_id: approvalApproverId.trim() || undefined,
    };

    const res = await fetch("/api/workspace/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    setApprovalCreateOpen(false);
    setApprovalTitle("");
    setApprovalJustification("");
    setApprovalRisk("");
    setApprovalNeededBy("");
    setApprovalDeadline("");
    setApprovalCurrency("USD");
    setApprovalCost("");
    setApprovalLinks("");
    setApprovalNotes("");
    setApprovalApproverId("");
    setLeaveCoverage("");
    setTravelOptions("");
    setPurchaseAlternatives("");
    void reload();
  };

  const decideApproval = async (approvalId: string, decision: "approved" | "rejected" | "needs_changes", note: string) => {
    const res = await fetch(`/api/workspace/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ decision, decision_note: note }),
    });
    if (!res.ok) return;
    setDecisionModalOpen(false);
    setDecisionApproval(null);
    setDecisionNote("");
    setDecisionAction("approved");
    void reload();
  };

  const postDecision = async () => {
    const title = newDecision.trim();
    if (!title) return;
    const res = await fetch("/api/workspace/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    setNewDecision("");
    void reload();
  };

  const patchDecision = async (id: string, status: string) => {
    await fetch(`/api/workspace/decisions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    void reload();
  };

  // Hooks must run before any early return (loading/err); otherwise React #310.
  const todayYmd = React.useMemo(() => ymdToday(), []);

  const kpiTop5 = React.useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending");

    const byDueAsc = (a: { due_date: string; due_time: string }, b: { due_date: string; due_time: string }) => {
      const dc = a.due_date.localeCompare(b.due_date);
      if (dc !== 0) return dc;
      return String(a.due_time ?? "").localeCompare(String(b.due_time ?? ""));
    };

    const overdue = pending
      .filter((t) => isTaskOverdue(t))
      .sort(byDueAsc)
      .slice(0, 5);

    const todaysLoad = pending
      .filter((t) => t.due_date === todayYmd)
      .sort(byDueAsc)
      .slice(0, 5);

    const followups = pending
      .filter((t) => t.type === "followup")
      .sort(byDueAsc)
      .slice(0, 5);

    const priorities = pending
      .filter((t) => t.type === "todo")
      .sort(byDueAsc)
      .slice(0, 5);

    const pendingDecisions = [...decisions]
      .filter((d) => d.status === "pending")
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 5);

    return { overdue, todaysLoad, followups, priorities, pendingDecisions };
  }, [decisions, tasks, todayYmd]);

  const todayBriefLines = React.useMemo(
    () => buildTodayActionBriefLines(tasks, events, todayYmd),
    [tasks, events, todayYmd],
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Loading workspace…</div>
    );
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
        {err}
      </div>
    );
  }

  const focusStats = {
    overdue: brief?.overdue ?? 0,
    todaysLoad: brief?.todaysLoad ?? 0,
    waitingFollowups: brief?.waitingFollowups ?? 0,
    activePriorities: brief?.activePriorities ?? 0,
    pendingDecisions: brief?.pendingDecisions ?? 0,
  };

  return (
    <div className="space-y-8">
      {isFounder && followPendingApproval > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <span className="font-medium">{followPendingApproval} follow-up send(s)</span> waiting for your approval.
          <button
            type="button"
            className="ml-2 font-medium text-foreground underline underline-offset-2"
            onClick={() => openSettingsToTab("follow_automation")}
          >
            Review in Follow automation
          </button>
        </div>
      ) : null}
      <section aria-labelledby="today-focus-overview-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">{overviewGreeting(profile)}</p>
          </div>
          <h2 id="today-focus-overview-heading" className="shrink-0 text-sm font-semibold text-foreground">
            Today&apos;s Focus
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              {
                kind: "overdue" as const,
                label: "Overdue",
                count: focusStats.overdue,
                items: kpiTop5.overdue.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "todaysLoad" as const,
                label: "Today's load",
                count: focusStats.todaysLoad,
                items: kpiTop5.todaysLoad.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${String(t.due_time ?? "").slice(0, 5) || "—"} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "followups" as const,
                label: "Follow-ups",
                count: focusStats.waitingFollowups,
                items: kpiTop5.followups.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "priorities" as const,
                label: "Priorities",
                count: focusStats.activePriorities,
                items: kpiTop5.priorities.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "pendingDecisions" as const,
                label: "Approvals",
                count: focusStats.pendingDecisions ?? 0,
                items: approvals
                  .filter((a) => (a.status === "pending" || a.status === "needs_changes") && a.approver_user_id === user?.id)
                  .slice(0, 5)
                  .map((a) => ({
                    id: a.id,
                    title: a.title,
                    meta:
                      [
                        a.template_type,
                        formatMoneyCents(a.cost_total_cents, a.currency) ?? "",
                        a.needed_by ? new Date(a.needed_by).toLocaleDateString() : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "",
                  })),
              },
            ] as const
          ).map((card) => (
            <button
              key={card.kind}
              type="button"
              onClick={() => requestOverviewKpi(card.kind as OverviewKpiKind)}
              className="flex h-full min-h-[11rem] flex-col rounded-xl border border-border/70 bg-muted/25 px-3 py-3 text-left shadow-sm transition-[box-shadow,transform] hover:bg-muted/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]"
              aria-label={`Open ${card.label}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</div>
                <span className="text-[11px] font-medium text-muted-foreground">Open</span>
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.count}</div>
              <div className="mt-3 min-h-0 flex-1 border-t border-border/50 pt-2">
                {card.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing pending.</p>
                ) : (
                  <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                    {card.items.slice(0, 5).map((it) => (
                      <li key={it.id} className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">{it.title}</div>
                        {it.meta ? <div className="truncate text-[10px] text-muted-foreground">{it.meta}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s briefing</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tasks due today, timed items, and calendar—no overdue summary.
          </p>
          <ul className="mt-2 list-none space-y-1.5 text-sm leading-snug text-foreground">
            {todayBriefLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <AutomateFollowups />
      </section>

      <section className="space-y-3" aria-labelledby="approvals-heading">
          <div className="flex items-end justify-between gap-3">
            <h2 id="approvals-heading" className="text-sm font-semibold text-foreground">
              Approvals
            </h2>
            <Button type="button" size="sm" variant="ghost" className="h-8 border border-border/60" onClick={() => setApprovalCreateOpen(true)}>
              Create approval
            </Button>
          </div>

          {approvals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No approvals yet.</p>
          ) : (
            <ul className="space-y-2">
              {approvals.slice(0, 12).map((a) => {
                const money = formatMoneyCents(a.cost_total_cents, a.currency);
                const neededBy = a.needed_by ? new Date(a.needed_by).toLocaleDateString() : null;
                const isMine = Boolean(user?.id && a.requester_user_id === user.id);
                const isInbox = Boolean(user?.id && a.approver_user_id === user.id);
                const actionable = isInbox && (a.status === "pending" || a.status === "needs_changes");
                return (
                  <li key={a.id} className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{a.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            a.template_type,
                            money ?? "",
                            neededBy ? `needed by ${neededBy}` : "",
                            isMine ? "requested by you" : `requester ${personLabel(a.requester_user_id)}`,
                            isInbox ? "to you" : `approver ${personLabel(a.approver_user_id)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${approvalStatusBadge(a.status)}`}>
                        {a.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    {a.decision_note ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Note:</span> {a.decision_note}
                      </div>
                    ) : null}

                    {actionable ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setDecisionApproval(a);
                            setDecisionAction("approved");
                            setDecisionNote("");
                            setDecisionModalOpen(true);
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="border border-border/60"
                          onClick={() => {
                            setDecisionApproval(a);
                            setDecisionAction("needs_changes");
                            setDecisionNote("");
                            setDecisionModalOpen(true);
                          }}
                        >
                          Request changes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="border border-border/60 text-red-700 dark:text-red-300"
                          onClick={() => {
                            setDecisionApproval(a);
                            setDecisionAction("rejected");
                            setDecisionNote("");
                            setDecisionModalOpen(true);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      {approvalCreateOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close approval create" className="absolute inset-0 bg-black/30" onClick={() => setApprovalCreateOpen(false)} />
          <div className="absolute left-1/2 top-8 z-10 w-[min(820px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl bg-background shadow-[0_1px_0_rgba(70,54,39,0.05),0_12px_40px_rgba(61,45,33,0.14)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="text-sm font-semibold">Create approval</div>
              <button type="button" onClick={() => setApprovalCreateOpen(false)} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground hover:bg-foreground/5">
                Close
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto p-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Template</div>
                      <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={approvalTemplate} onChange={(e) => setApprovalTemplate(e.target.value as ApprovalTemplateType)}>
                        <option value="leave">Leave request</option>
                        <option value="travel">Travel request</option>
                        <option value="purchase">Purchase request</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Approver</div>
                      <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={approvalApproverId} onChange={(e) => setApprovalApproverId(e.target.value)}>
                        <option value="">Select</option>
                        {memberIds.map((id) => (
                          <option key={id} value={id}>
                            {personLabel(id)}
                            {id === defaultApproverId ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Title</div>
                    <Input value={approvalTitle} onChange={(e) => setApprovalTitle(e.target.value)} placeholder="Short title (auto ok)" />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Needed by</div>
                      <Input type="datetime-local" value={approvalNeededBy} onChange={(e) => setApprovalNeededBy(e.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Decision deadline</div>
                      <Input type="datetime-local" value={approvalDeadline} onChange={(e) => setApprovalDeadline(e.target.value)} />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Currency</div>
                      <Input value={approvalCurrency} onChange={(e) => setApprovalCurrency(e.target.value)} placeholder="USD" />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">Total cost (optional)</div>
                      <Input value={approvalCost} onChange={(e) => setApprovalCost(e.target.value)} placeholder="e.g. 1299.00" />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Business justification (required)</div>
                    <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={approvalJustification} onChange={(e) => setApprovalJustification(e.target.value)} placeholder="Why is this needed? Why now?" />
                  </label>

                  <label className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Risk/impact if delayed (required)</div>
                    <textarea className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={approvalRisk} onChange={(e) => setApprovalRisk(e.target.value)} placeholder="What breaks if this is not approved?" />
                  </label>

                  <label className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Links / references (one per line)</div>
                    <textarea className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={approvalLinks} onChange={(e) => setApprovalLinks(e.target.value)} placeholder="https://...\nhttps://..." />
                  </label>

                  <label className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Notes for approver</div>
                    <textarea className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Anything the approver should know." />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Template fields</div>

                    {approvalTemplate === "leave" ? (
                      <div className="mt-2 space-y-2">
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Leave type</div>
                          <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                            <option value="annual">Annual</option>
                            <option value="sick">Sick</option>
                            <option value="unpaid">Unpaid</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Start date (required)</div>
                          <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">End date (required)</div>
                          <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Coverage plan (required)</div>
                          <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={leaveCoverage} onChange={(e) => setLeaveCoverage(e.target.value)} placeholder="Who covers what? Links to handoffs." />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Urgency</div>
                          <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={leaveUrgency} onChange={(e) => setLeaveUrgency(e.target.value)}>
                            <option value="normal">Normal</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {approvalTemplate === "travel" ? (
                      <div className="mt-2 space-y-2">
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Purpose (required)</div>
                          <Input value={travelPurpose} onChange={(e) => setTravelPurpose(e.target.value)} placeholder="Client meeting, conference..." />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">From (required)</div>
                          <Input value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)} placeholder="City / airport" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">To (required)</div>
                          <Input value={travelTo} onChange={(e) => setTravelTo(e.target.value)} placeholder="City / airport" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Depart window (required)</div>
                          <Input value={travelDepartWindow} onChange={(e) => setTravelDepartWindow(e.target.value)} placeholder="e.g. Apr 20 morning" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Return window</div>
                          <Input value={travelReturnWindow} onChange={(e) => setTravelReturnWindow(e.target.value)} placeholder="e.g. Apr 23 evening" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Travelers</div>
                          <Input value={travelTravelers} onChange={(e) => setTravelTravelers(e.target.value)} placeholder="Names" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Options (paste, required)</div>
                          <textarea className="min-h-[120px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={travelOptions} onChange={(e) => setTravelOptions(e.target.value)} placeholder="Option 1: $... link...\nOption 2: $... link..." />
                        </label>
                      </div>
                    ) : null}

                    {approvalTemplate === "purchase" ? (
                      <div className="mt-2 space-y-2">
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Item/service (required)</div>
                          <Input value={purchaseItem} onChange={(e) => setPurchaseItem(e.target.value)} placeholder="Tool / hardware / service" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Vendor (required)</div>
                          <Input value={purchaseVendor} onChange={(e) => setPurchaseVendor(e.target.value)} placeholder="Vendor name" />
                        </label>
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Billing</div>
                          <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={purchaseRecurring} onChange={(e) => setPurchaseRecurring(e.target.value)}>
                            <option value="one_time">One-time</option>
                            <option value="recurring">Recurring</option>
                          </select>
                        </label>
                        {purchaseRecurring === "recurring" ? (
                          <label className="space-y-1 block">
                            <div className="text-[11px] font-medium text-muted-foreground">Cadence</div>
                            <Input value={purchaseCadence} onChange={(e) => setPurchaseCadence(e.target.value)} placeholder="Monthly / yearly" />
                          </label>
                        ) : null}
                        <label className="space-y-1 block">
                          <div className="text-[11px] font-medium text-muted-foreground">Alternatives considered</div>
                          <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={purchaseAlternatives} onChange={(e) => setPurchaseAlternatives(e.target.value)} placeholder="Cheaper or existing options?" />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void submitApproval()}>
                      Submit
                    </Button>
                    <Button type="button" variant="ghost" className="border border-border/60" onClick={() => setApprovalCreateOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Required fields depend on template. If Submit does nothing, a required field is missing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {decisionModalOpen && decisionApproval ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close approval decision" className="absolute inset-0 bg-black/30" onClick={() => setDecisionModalOpen(false)} />
          <div className="absolute left-1/2 top-16 z-10 w-[min(720px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl bg-background shadow-[0_1px_0_rgba(70,54,39,0.05),0_12px_40px_rgba(61,45,33,0.14)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{decisionAction.replaceAll("_", " ")}</div>
                <div className="truncate text-xs text-muted-foreground">{decisionApproval.title}</div>
              </div>
              <button type="button" onClick={() => setDecisionModalOpen(false)} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground hover:bg-foreground/5">
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="space-y-1 block">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Note{decisionAction === "approved" ? " (optional)" : " (required)"}
                </div>
                <textarea className="min-h-[88px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Add context, constraints, or what to change." />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void decideApproval(decisionApproval.id, decisionAction, decisionNote.trim())}
                >
                  Confirm
                </Button>
                <Button type="button" variant="ghost" className="border border-border/60" onClick={() => setDecisionModalOpen(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Reject / Request changes requires a note.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
