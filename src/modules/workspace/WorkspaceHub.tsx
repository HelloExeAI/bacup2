"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";
import { useUserStore } from "@/store/userStore";
import { useTaskStore } from "@/store/taskStore";
import type { SettingsPayload, TeamMemberSummary } from "@/modules/settings/types";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";
import { FollowWithBacup } from "@/modules/workspace/FollowWithBacup";
import { OutboundNudgeDraft } from "@/modules/workspace/OutboundNudgeDraft";
import { WorkspaceOsV2, type WorkspaceV2Bundle } from "@/modules/workspace/WorkspaceOsV2";
import { requestOverviewKpi, type OverviewKpiKind } from "@/modules/tasks/overviewKpiBus";
import { ymdToday } from "@/modules/tasks/dayBriefing";

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

type ProjectRow = {
  id: string;
  name: string;
  health_status: string;
  summary: string | null;
  owner_user_id: string | null;
  updated_at: string;
};

type ValueRow = { id: string; label: string; sort_order: number };

type RecRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  value_id: string | null;
  created_at: string;
};

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

/** One energetic line tied to live KPIs (not generic fluff). */
function motivationFromTodaysFocus(
  stats: {
    overdue: number;
    todaysLoad: number;
    waitingFollowups: number;
    activePriorities: number;
    pendingDecisions: number;
  },
  openCrossTeamDeps: number,
): string {
  const { overdue, todaysLoad, waitingFollowups, activePriorities, pendingDecisions } = stats;

  if (overdue > 0) {
    return overdue >= 8
      ? "Overdue stack is real—take the oldest item first; momentum is your friend."
      : "Overdue work is calling—clear one now before the pile grows.";
  }
  if (pendingDecisions > 0) {
    return pendingDecisions >= 3
      ? "Several decisions are waiting on you—one sharp call unlocks the whole team."
      : "Leadership moment: a decision today beats a perfect one next week.";
  }
  if (openCrossTeamDeps > 0) {
    return "Cross-team handoffs are open—nudge what you’re waiting on before dates slip.";
  }
  if (todaysLoad >= 5) {
    return "Heavy due-today load—time-box the big rocks and protect focus time.";
  }
  if (todaysLoad >= 1) {
    return "Execution mode—ship what’s due today and stay ahead of the clock.";
  }
  if (waitingFollowups > activePriorities && waitingFollowups >= 3) {
    return "Follow-ups are outpacing new work—close loops so nothing boomerangs.";
  }
  if (activePriorities >= 4) {
    return "Priorities are stacked—pick the one that moves revenue, risk, or people the most.";
  }
  if (waitingFollowups >= 2) {
    return "Ops rhythm: your follow-ups keep promises and pipelines honest—keep swinging.";
  }
  if (activePriorities >= 2) {
    return "Todo momentum—finish the next priority before the queue whispers louder.";
  }
  return "Clear runway—use the calm to get ahead or sharpen the next sprint.";
}

function healthDot(status: string): string {
  switch (status) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/40";
  }
}

export function WorkspaceHub() {
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const tasks = useTaskStore((s) => s.tasks);
  const { openSettingsToTab } = useSettingsModal();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [ctx, setCtx] = React.useState<HubContext | null>(null);
  const [brief, setBrief] = React.useState<Record<string, number> | null>(null);
  const [decisions, setDecisions] = React.useState<DecisionRow[]>([]);
  const [approvals, setApprovals] = React.useState<ApprovalRow[]>([]);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [values, setValues] = React.useState<ValueRow[]>([]);
  const [recognitions, setRecognitions] = React.useState<RecRow[]>([]);
  const [orgEdges, setOrgEdges] = React.useState<OrgEdge[]>([]);
  const [team, setTeam] = React.useState<TeamMemberSummary[]>([]);
  const [v2Bundle, setV2Bundle] = React.useState<WorkspaceV2Bundle>({
    playbookTemplates: [],
    playbookRuns: [],
    dependencies: [],
    meetings: [],
  });

  const [followPendingApproval, setFollowPendingApproval] = React.useState(0);

  const [eaPolicies, setEaPolicies] = React.useState<
    Array<{
      ea_user_id: string;
      can_view_email_derived_tasks?: boolean;
      can_view_calendar_summary?: boolean;
      can_view_decisions?: boolean;
      can_view_projects?: boolean;
      can_view_recognition_feed?: boolean;
    }>
  >([]);

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
      setBrief((hubJson?.morningBrief as Record<string, number>) ?? null);
      setDecisions((hubJson?.decisions as DecisionRow[]) ?? []);
      setProjects((hubJson?.projects as ProjectRow[]) ?? []);
      setValues((hubJson?.companyValues as ValueRow[]) ?? []);
      setRecognitions((hubJson?.recognitions as RecRow[]) ?? []);
      setOrgEdges((hubJson?.orgEdges as OrgEdge[]) ?? []);

      const rawV2 = hubJson?.v2 as WorkspaceV2Bundle | undefined;
      if (rawV2 && typeof rawV2 === "object") {
        setV2Bundle({
          playbookTemplates: Array.isArray(rawV2.playbookTemplates) ? rawV2.playbookTemplates : [],
          playbookRuns: Array.isArray(rawV2.playbookRuns) ? rawV2.playbookRuns : [],
          dependencies: Array.isArray(rawV2.dependencies) ? rawV2.dependencies : [],
          meetings: Array.isArray(rawV2.meetings) ? rawV2.meetings : [],
        });
      } else {
        setV2Bundle({
          playbookTemplates: [],
          playbookRuns: [],
          dependencies: [],
          meetings: [],
        });
      }

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

      const ownerId = (hubJson?.context as HubContext | undefined)?.workspaceOwnerId;
      const uid = user?.id;
      if (uid && ownerId && uid === ownerId) {
        const eaRes = await fetch("/api/workspace/ea-policy", { credentials: "include" });
        if (eaRes.ok) {
          const eaJson = (await eaRes.json().catch(() => null)) as {
            policies?: Array<{
              ea_user_id: string;
              can_view_email_derived_tasks?: boolean;
              can_view_calendar_summary?: boolean;
              can_view_decisions?: boolean;
              can_view_projects?: boolean;
              can_view_recognition_feed?: boolean;
            }>;
          } | null;
          setEaPolicies(eaJson?.policies ?? []);
        } else {
          setEaPolicies([]);
        }
      } else {
        setEaPolicies([]);
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
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newValue, setNewValue] = React.useState("");
  const [recTo, setRecTo] = React.useState("");
  const [recMsg, setRecMsg] = React.useState("");
  const [recValueId, setRecValueId] = React.useState("");
  const [orgReport, setOrgReport] = React.useState("");
  const [orgManager, setOrgManager] = React.useState("");
  const [eaTarget, setEaTarget] = React.useState("");
  const [eaFlags, setEaFlags] = React.useState({
    can_view_email_derived_tasks: false,
    can_view_calendar_summary: false,
    can_view_decisions: true,
    can_view_projects: true,
    can_view_recognition_feed: true,
  });

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

  const postProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const res = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, health_status: "unknown" }),
    });
    if (!res.ok) return;
    setNewProjectName("");
    void reload();
  };

  const patchProjectHealth = async (id: string, health_status: string) => {
    await fetch(`/api/workspace/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ health_status }),
    });
    void reload();
  };

  const postValue = async () => {
    const label = newValue.trim();
    if (!label) return;
    const res = await fetch("/api/workspace/values", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    if (!res.ok) return;
    setNewValue("");
    void reload();
  };

  const postRecognition = async () => {
    if (!recTo || !recMsg.trim()) return;
    const res = await fetch("/api/workspace/recognitions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        to_user_id: recTo,
        message: recMsg.trim(),
        value_id: recValueId || null,
      }),
    });
    if (!res.ok) return;
    setRecMsg("");
    void reload();
  };

  const postOrg = async () => {
    if (!orgReport || !orgManager) return;
    const res = await fetch("/api/workspace/org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ report_user_id: orgReport, manager_user_id: orgManager, relation_rank: 1 }),
    });
    if (!res.ok) return;
    setOrgReport("");
    setOrgManager("");
    void reload();
  };

  const deleteOrg = async (id: string) => {
    await fetch(`/api/workspace/org/${id}`, { method: "DELETE", credentials: "include" });
    void reload();
  };

  const saveEaPolicy = async () => {
    if (!eaTarget) return;
    const res = await fetch("/api/workspace/ea-policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ea_user_id: eaTarget, ...eaFlags }),
    });
    if (res.ok) void reload();
  };

  const [dayBriefLines, setDayBriefLines] = React.useState<string[] | null>(null);
  const [dayBriefLoading, setDayBriefLoading] = React.useState(false);

  const openCrossTeamDepsCount = React.useMemo(
    () => (v2Bundle.dependencies ?? []).filter((d) => d.status === "open").length,
    [v2Bundle.dependencies],
  );

  React.useEffect(() => {
    if (loading || err) return;

    const kpis = brief ?? {
      overdue: 0,
      todaysLoad: 0,
      waitingFollowups: 0,
      activePriorities: 0,
      pendingDecisions: 0,
    };

    let cancelled = false;
    setDayBriefLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/workspace/overview-brief", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ kpis, openCrossTeamDeps: openCrossTeamDepsCount }),
        });
        const j = (await res.json().catch(() => null)) as { lines?: unknown } | null;
        const raw = Array.isArray(j?.lines) ? j.lines.map((x) => String(x)) : [];
        if (cancelled) return;
        setDayBriefLines(raw.length ? raw.slice(0, 5) : null);
      } catch {
        if (!cancelled) setDayBriefLines(null);
      } finally {
        if (!cancelled) setDayBriefLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, err, brief, openCrossTeamDepsCount]);

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

  const openCrossTeamDeps = (v2Bundle.dependencies ?? []).filter((d) => d.status === "open").length;
  const focusMotivation = motivationFromTodaysFocus(focusStats, openCrossTeamDeps);

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
            <p className="max-w-2xl text-sm leading-snug text-muted-foreground">{focusMotivation}</p>
          </div>
          <h2 id="today-focus-overview-heading" className="shrink-0 text-sm font-semibold text-foreground">
            Today&apos;s Focus
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["overdue", "Overdue", focusStats.overdue],
              ["todaysLoad", "Today's load", focusStats.todaysLoad],
              ["followups", "Follow-ups", focusStats.waitingFollowups],
              ["priorities", "Priorities", focusStats.activePriorities],
              ["pendingDecisions", "Approvals", focusStats.pendingDecisions ?? 0],
            ] as const
          ).map(([kind, label, v]) => (
            <button
              key={kind}
              type="button"
              onClick={() => requestOverviewKpi(kind as OverviewKpiKind)}
              className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-left shadow-sm transition-[box-shadow,transform] hover:bg-muted/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{v}</div>
              <span className="sr-only">
                {kind === "overdue" && "Open overdue tasks"}
                {kind === "todaysLoad" && "Open tasks due today"}
                {kind === "followups" && "Open follow-ups"}
                {kind === "priorities" && "Open priority todos"}
                {kind === "pendingDecisions" && "Scroll to approvals queue"}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              {
                kind: "overdue",
                label: "Overdue",
                items: kpiTop5.overdue.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "todaysLoad",
                label: "Today's load",
                items: kpiTop5.todaysLoad.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${String(t.due_time ?? "").slice(0, 5) || "—"} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "followups",
                label: "Follow-ups",
                items: kpiTop5.followups.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "priorities",
                label: "Priorities",
                items: kpiTop5.priorities.map((t) => ({
                  id: t.id,
                  title: t.title,
                  meta: `${t.due_date} ${String(t.due_time ?? "").slice(0, 5)} · @${t.assigned_to || "self"}`,
                })),
              },
              {
                kind: "pendingDecisions",
                label: "Approvals",
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
              className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left shadow-sm transition-[box-shadow,transform] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]"
              aria-label={`Open ${card.label}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Top 5 {card.label}
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">Open</span>
              </div>
              {card.items.length === 0 ? (
                <div className="mt-2 text-xs text-muted-foreground">Nothing pending.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {card.items.slice(0, 5).map((it) => (
                    <li key={it.id} className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground">{it.title}</div>
                      {it.meta ? <div className="truncate text-[10px] text-muted-foreground">{it.meta}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Day brief</h3>
          {dayBriefLoading && !dayBriefLines?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">Drafting…</p>
          ) : dayBriefLines && dayBriefLines.length > 0 ? (
            <ul className="mt-2 list-none space-y-1.5 text-sm leading-snug text-foreground">
              {dayBriefLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Brief unavailable.</p>
          )}
        </div>
        <FollowWithBacup
          kpis={focusStats}
          openCrossTeamDeps={openCrossTeamDeps}
          dayBriefLines={dayBriefLines}
        />
        <OutboundNudgeDraft
          kpis={focusStats}
          openCrossTeamDeps={openCrossTeamDeps}
          dayBriefLines={dayBriefLines}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
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
                            isMine ? "requested by you" : `requester ${displayName(a.requester_user_id)}`,
                            isInbox ? "to you" : `approver ${displayName(a.approver_user_id)}`,
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

        <section className="space-y-3" aria-labelledby="projects-heading">
          <h2 id="projects-heading" className="text-sm font-semibold text-foreground">
            Project cards
          </h2>
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm"
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${healthDot(p.health_status)}`} title={p.health_status} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{p.name}</div>
                    {p.summary ? <p className="text-xs text-muted-foreground">{p.summary}</p> : null}
                  </div>
                  {isFounder ? (
                    <div className="flex shrink-0 gap-1">
                      {(["green", "yellow", "red", "unknown"] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          title={h}
                          className={`h-6 w-6 rounded-full border border-border/60 ${healthDot(h)} opacity-90 hover:opacity-100`}
                          onClick={() => void patchProjectHealth(p.id, h)}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {isFounder ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">New project</label>
                <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Name" />
              </div>
              <Button type="button" size="sm" onClick={() => void postProject()}>
                Add
              </Button>
            </div>
          ) : null}
        </section>
      </div>

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
                            {displayName(id)}
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

      <WorkspaceOsV2
        isFounder={isFounder}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        v2={v2Bundle}
        reload={reload}
      />

      {isFounder ? (
        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Org reporting</h2>
            <p className="text-xs text-muted-foreground">
              Optional secondary reporting lines. Add who reports to whom in your workspace.
            </p>
            {orgEdges.length === 0 ? (
              <p className="text-xs text-muted-foreground">No edges yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {orgEdges.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                    <span>
                      {displayName(e.report_user_id)} → {displayName(e.manager_user_id)}
                      {e.relation_rank > 1 ? ` (alt ${e.relation_rank})` : ""}
                    </span>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => void deleteOrg(e.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Report (person)</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={orgReport}
                  onChange={(e) => setOrgReport(e.target.value)}
                >
                  <option value="">Select</option>
                  {memberIds.map((id) => (
                    <option key={id} value={id}>
                      {displayName(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Manager</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={orgManager}
                  onChange={(e) => setOrgManager(e.target.value)}
                >
                  <option value="">Select</option>
                  {memberIds.map((id) => (
                    <option key={id} value={id}>
                      {displayName(id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="button" size="sm" variant="ghost" className="border border-border/60" onClick={() => void postOrg()}>
              Add reporting line
            </Button>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">EA delegation</h2>
            <p className="text-xs text-muted-foreground">
              Choose an EA team member and set what they can see in your workspace hub.
            </p>
            {eaPolicies.length > 0 ? (
              <ul className="text-[11px] text-muted-foreground">
                {eaPolicies.map((p) => (
                  <li key={String(p.ea_user_id)}>
                    EA {displayName(String(p.ea_user_id))}: decisions {String(p.can_view_decisions)}, projects{" "}
                    {String(p.can_view_projects)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Executive assistant</label>
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={eaTarget}
                onChange={(e) => setEaTarget(e.target.value)}
              >
                <option value="">Select user</option>
                {memberIds
                  .filter((id) => id !== user?.id)
                  .map((id) => (
                    <option key={id} value={id}>
                      {displayName(id)}
                    </option>
                  ))}
              </select>
              {(
                [
                  ["can_view_email_derived_tasks", "Email-derived tasks (metadata)"],
                  ["can_view_calendar_summary", "Calendar summary"],
                  ["can_view_decisions", "Decisions"],
                  ["can_view_projects", "Projects"],
                  ["can_view_recognition_feed", "Recognition"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(eaFlags[key])}
                    onChange={(e) => setEaFlags((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <Button type="button" size="sm" onClick={() => void saveEaPolicy()}>
                Save EA access
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Recognition &amp; values</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Company values</h3>
            {values.length === 0 ? (
              <p className="text-xs text-muted-foreground">No values yet{isFounder ? " — add tags for shout-outs." : ""}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {values.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {v.label}
                  </li>
                ))}
              </ul>
            )}
            {isFounder ? (
              <div className="mt-3 flex gap-2">
                <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="New value" />
                <Button type="button" size="sm" onClick={() => void postValue()}>
                  Add
                </Button>
              </div>
            ) : null}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Feed</h3>
            {recognitions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No shout-outs yet.</p>
            ) : (
              <ul className="space-y-2">
                {recognitions.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm shadow-sm">
                    <span className="font-medium text-foreground">{displayName(r.from_user_id)}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium text-foreground">{displayName(r.to_user_id)}</span>
                    <p className="mt-1 text-xs text-foreground/90">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Give recognition</p>
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={recTo}
                onChange={(e) => setRecTo(e.target.value)}
              >
                <option value="">Teammate</option>
                {memberIds
                  .filter((id) => id !== user?.id)
                  .map((id) => (
                    <option key={id} value={id}>
                      {displayName(id)}
                    </option>
                  ))}
              </select>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="Message"
                value={recMsg}
                onChange={(e) => setRecMsg(e.target.value)}
              />
              {values.length > 0 ? (
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={recValueId}
                  onChange={(e) => setRecValueId(e.target.value)}
                >
                  <option value="">Link to value (optional)</option>
                  {values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button type="button" size="sm" onClick={() => void postRecognition()}>
                Post
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
