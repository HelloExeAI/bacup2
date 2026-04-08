"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/store/userStore";
import type { SettingsPayload, TeamMemberSummary } from "@/modules/settings/types";

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

function homeLabel(role: string): string {
  switch (role) {
    case "founder":
      return "Command center";
    case "ea":
      return "Executive support";
    case "manager":
      return "Team execution";
    case "associate":
      return "Your workspace";
    default:
      return "Workspace";
  }
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

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [ctx, setCtx] = React.useState<HubContext | null>(null);
  const [brief, setBrief] = React.useState<Record<string, number> | null>(null);
  const [emailNote, setEmailNote] = React.useState("");
  const [decisions, setDecisions] = React.useState<DecisionRow[]>([]);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [values, setValues] = React.useState<ValueRow[]>([]);
  const [recognitions, setRecognitions] = React.useState<RecRow[]>([]);
  const [orgEdges, setOrgEdges] = React.useState<OrgEdge[]>([]);
  const [team, setTeam] = React.useState<TeamMemberSummary[]>([]);
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
      setEmailNote(typeof hubJson?.emailPolicyNote === "string" ? hubJson.emailPolicyNote : "");
      setDecisions((hubJson?.decisions as DecisionRow[]) ?? []);
      setProjects((hubJson?.projects as ProjectRow[]) ?? []);
      setValues((hubJson?.companyValues as ValueRow[]) ?? []);
      setRecognitions((hubJson?.recognitions as RecRow[]) ?? []);
      setOrgEdges((hubJson?.orgEdges as OrgEdge[]) ?? []);

      const settingsJson = (await settingsRes.json().catch(() => null)) as SettingsPayload | null;
      if (settingsRes.ok && settingsJson?.teamMembers) {
        setTeam(settingsJson.teamMembers);
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

  const role = ctx?.viewerRole ?? profile?.role ?? "member";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {homeLabel(role)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business OS</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Morning brief, decisions, and project health in one place. V2 will add playbooks, dependency maps, and a
          security center.
        </p>
        {emailNote ? (
          <p className="mt-2 max-w-3xl rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Email policy: </span>
            {emailNote}
          </p>
        ) : null}
      </header>

      {brief ? (
        <section aria-labelledby="brief-heading">
          <h2 id="brief-heading" className="mb-3 text-sm font-semibold text-foreground">
            Morning brief
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Overdue", brief.overdue],
              ["Today's load", brief.todaysLoad],
              ["Follow-ups", brief.waitingFollowups],
              ["Priorities", brief.activePriorities],
              ["Pending decisions", brief.pendingDecisions ?? 0],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 shadow-sm"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              Open task cockpit
            </Link>
            <Link
              href="/calendar"
              className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              Calendar
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="decisions-heading">
          <h2 id="decisions-heading" className="text-sm font-semibold text-foreground">
            Decision queue
          </h2>
          {decisions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decisions yet.</p>
          ) : (
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-foreground">{d.title}</span>
                      {d.context_notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">{d.context_notes}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {d.status}
                    </span>
                  </div>
                  {isFounder ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {d.status === "pending" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 border border-border/60 text-[11px]"
                            onClick={() => void patchDecision(d.id, "decided")}
                          >
                            Mark decided
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => void patchDecision(d.id, "deferred")}
                          >
                            Defer
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {isFounder ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">New decision</label>
                <Input value={newDecision} onChange={(e) => setNewDecision(e.target.value)} placeholder="Title" />
              </div>
              <Button type="button" size="sm" onClick={() => void postDecision()}>
                Add
              </Button>
            </div>
          ) : null}
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
