"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PlaybookStep = { id: string; template_id: string; sort_order: number; title: string; detail: string | null };
type PlaybookTemplate = {
  id: string;
  name: string;
  description: string | null;
  cadence_label: string | null;
  created_at: string;
  steps: PlaybookStep[];
};

type PlaybookRun = {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
};

type CrossDep = {
  id: string;
  waiting_on_label: string;
  blocked_party_label: string;
  project_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MeetingRow = {
  id: string;
  title: string;
  scheduled_at: string | null;
  calendar_event_id: string | null;
  phase: string;
  before_agenda: string | null;
  before_decisions_needed: string | null;
  after_decisions_summary: string | null;
  after_action_items: unknown;
  created_at: string;
  completed_at: string | null;
};

type ProjectOption = { id: string; name: string };

type RunStepDetail = PlaybookStep & { is_done: boolean };

export type WorkspaceV2Bundle = {
  playbookTemplates: PlaybookTemplate[];
  playbookRuns: PlaybookRun[];
  dependencies: CrossDep[];
  meetings: MeetingRow[];
};

export function WorkspaceOsV2({
  isFounder,
  projects,
  v2,
  reload,
}: {
  isFounder: boolean;
  projects: ProjectOption[];
  v2: WorkspaceV2Bundle;
  reload: () => void | Promise<void>;
}) {
  const [pbName, setPbName] = React.useState("");
  const [pbCadence, setPbCadence] = React.useState("");
  const [pbStepsText, setPbStepsText] = React.useState("");
  const [depWaiting, setDepWaiting] = React.useState("");
  const [depBlocked, setDepBlocked] = React.useState("");
  const [depProject, setDepProject] = React.useState("");
  const [depNotes, setDepNotes] = React.useState("");
  const [meetTitle, setMeetTitle] = React.useState("");
  const [meetWhen, setMeetWhen] = React.useState("");
  const [meetAgenda, setMeetAgenda] = React.useState("");
  const [meetDecisionsNeeded, setMeetDecisionsNeeded] = React.useState("");
  const [openMeetingId, setOpenMeetingId] = React.useState<string | null>(null);
  const [runDetail, setRunDetail] = React.useState<{
    runId: string;
    steps: RunStepDetail[];
    template_name: string;
    status: string;
  } | null>(null);
  const [loadingRun, setLoadingRun] = React.useState(false);

  const activeRuns = v2.playbookRuns.filter((r) => r.status === "active");

  const loadRun = async (runId: string) => {
    setLoadingRun(true);
    try {
      const res = await fetch(`/api/workspace/playbook-runs/${runId}`, { credentials: "include" });
      const j = (await res.json().catch(() => null)) as {
        run?: { id: string; template_name?: string; status: string };
        steps?: RunStepDetail[];
      } | null;
      if (!res.ok || !j?.run || !j.steps) {
        setRunDetail(null);
        return;
      }
      setRunDetail({
        runId: j.run.id,
        template_name: j.run.template_name ?? "Playbook",
        status: j.run.status,
        steps: j.steps,
      });
    } finally {
      setLoadingRun(false);
    }
  };

  const postPlaybook = async () => {
    if (!pbName.trim()) return;
    const lines = pbStepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const res = await fetch("/api/workspace/playbooks", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: pbName.trim(),
        cadence_label: pbCadence.trim() || undefined,
        steps: lines.map((title) => ({ title })),
      }),
    });
    if (!res.ok) return;
    setPbName("");
    setPbCadence("");
    setPbStepsText("");
    await reload();
  };

  const startRun = async (templateId: string) => {
    const res = await fetch("/api/workspace/playbook-runs", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template_id: templateId }),
    });
    if (!res.ok) return;
    const j = (await res.json().catch(() => null)) as { id?: string } | null;
    await reload();
    if (j?.id) await loadRun(j.id);
  };

  const toggleStep = async (runId: string, stepId: string, isDone: boolean) => {
    const res = await fetch(`/api/workspace/playbook-runs/${runId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step_id: stepId, is_done: !isDone }),
    });
    if (!res.ok) return;
    await reload();
    await loadRun(runId);
  };

  const postDep = async () => {
    if (!depWaiting.trim() || !depBlocked.trim()) return;
    const res = await fetch("/api/workspace/dependencies", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        waiting_on_label: depWaiting.trim(),
        blocked_party_label: depBlocked.trim(),
        project_id: depProject || null,
        notes: depNotes.trim() || undefined,
      }),
    });
    if (!res.ok) return;
    setDepWaiting("");
    setDepBlocked("");
    setDepProject("");
    setDepNotes("");
    await reload();
  };

  const patchDepStatus = async (id: string, status: "open" | "resolved") => {
    await fetch(`/api/workspace/dependencies/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await reload();
  };

  const postMeeting = async () => {
    if (!meetTitle.trim()) return;
    let scheduled_at: string | null = null;
    if (meetWhen) {
      const d = new Date(meetWhen);
      if (!Number.isNaN(d.getTime())) scheduled_at = d.toISOString();
    }
    const res = await fetch("/api/workspace/meetings", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: meetTitle.trim(),
        scheduled_at,
        before_agenda: meetAgenda.trim() || undefined,
        before_decisions_needed: meetDecisionsNeeded.trim() || undefined,
      }),
    });
    if (!res.ok) return;
    setMeetTitle("");
    setMeetWhen("");
    setMeetAgenda("");
    setMeetDecisionsNeeded("");
    await reload();
  };

  const patchMeeting = async (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    await fetch(`/api/workspace/meetings/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reload();
  };

  const deleteMeeting = async (id: string) => {
    await fetch(`/api/workspace/meetings/${id}`, { method: "DELETE", credentials: "include" });
    setOpenMeetingId(null);
    await reload();
  };

  const deletePlaybook = async (id: string) => {
    await fetch(`/api/workspace/playbooks/${id}`, { method: "DELETE", credentials: "include" });
    await reload();
  };

  return (
    <div className="space-y-10 border-t border-border/60 pt-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Programs &amp; playbooks</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Recurring runs (launch, month-close, hiring sprint): templates with checklist steps. Start a run and check steps
          off as you go.
        </p>
      </div>

      {activeRuns.length > 0 && !runDetail ? (
        <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
          {activeRuns.length} active playbook run(s).{" "}
          <button type="button" className="font-medium text-foreground underline" onClick={() => void loadRun(activeRuns[0].id)}>
            Open checklist
          </button>
        </div>
      ) : null}

      {runDetail && runDetail.status === "active" ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-foreground">
            Active run: {runDetail.template_name}
            {!isFounder ? <span className="ml-2 font-normal text-muted-foreground">(view only)</span> : null}
          </div>
          {loadingRun ? (
            <p className="text-xs text-muted-foreground">Loading steps…</p>
          ) : (
            <ul className="space-y-2">
              {runDetail.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-sm">
                  {isFounder ? (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={s.is_done}
                      onChange={() => void toggleStep(runDetail.runId, s.id, s.is_done)}
                    />
                  ) : (
                    <span className="mt-0.5 w-10 shrink-0 text-[10px] text-muted-foreground">{s.is_done ? "Done" : "—"}</span>
                  )}
                  <div>
                    <div className="font-medium text-foreground">{s.title}</div>
                    {s.detail ? <p className="text-xs text-muted-foreground">{s.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {isFounder ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New playbook</div>
            <Input placeholder="Name (e.g. Month-close)" value={pbName} onChange={(e) => setPbName(e.target.value)} />
            <Input
              placeholder="Cadence label (optional)"
              value={pbCadence}
              onChange={(e) => setPbCadence(e.target.value)}
            />
            <textarea
              className="min-h-[100px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="One step per line"
              value={pbStepsText}
              onChange={(e) => setPbStepsText(e.target.value)}
            />
            <Button type="button" size="sm" onClick={() => void postPlaybook()}>
              Save playbook
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground lg:col-span-1">
            Only the workspace owner can create playbooks or start runs.
          </p>
        )}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Templates</div>
          {v2.playbookTemplates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No playbooks yet.</p>
          ) : (
            <ul className="space-y-2">
              {v2.playbookTemplates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{t.name}</span>
                    {t.cadence_label ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">({t.cadence_label})</span>
                    ) : null}
                    <span className="ml-2 text-[11px] text-muted-foreground">{t.steps?.length ?? 0} steps</span>
                  </div>
                  {isFounder ? (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => void startRun(t.id)}>
                        Start run
                      </Button>
                      <button
                        type="button"
                        className="text-[11px] text-red-600 hover:underline"
                        onClick={() => void deletePlaybook(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {v2.playbookRuns.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">Recent runs</div>
              <ul className="space-y-1 text-xs">
                {v2.playbookRuns.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => void loadRun(r.id)}
                    >
                      {r.template_name} · {r.status} · {new Date(r.started_at).toLocaleString()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground">Cross-team dependency map</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Who is waiting on whom—first-class links you can resolve when unblocked.
        </p>
        {v2.dependencies.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No dependencies logged.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {v2.dependencies.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{d.blocked_party_label}</span>
                  <span className="text-muted-foreground"> waiting on </span>
                  <span className="font-medium text-foreground">{d.waiting_on_label}</span>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {d.status}
                  </span>
                  {d.notes ? <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p> : null}
                </div>
                {isFounder ? (
                  <div className="flex gap-2">
                    {d.status === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => void patchDepStatus(d.id, "resolved")}
                      >
                        Mark resolved
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => void patchDepStatus(d.id, "open")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isFounder ? (
          <div className="mt-4 grid gap-2 rounded-xl border border-dashed border-border/60 p-3 sm:grid-cols-2">
            <Input placeholder="Waiting on (e.g. Design)" value={depWaiting} onChange={(e) => setDepWaiting(e.target.value)} />
            <Input placeholder="Blocked party (e.g. Engineering)" value={depBlocked} onChange={(e) => setDepBlocked(e.target.value)} />
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm sm:col-span-2"
              value={depProject}
              onChange={(e) => setDepProject(e.target.value)}
            >
              <option value="">Link project (optional)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <textarea
              className="min-h-[56px] rounded-md border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
              placeholder="Notes"
              value={depNotes}
              onChange={(e) => setDepNotes(e.target.value)}
            />
            <Button type="button" size="sm" onClick={() => void postDep()}>
              Add dependency
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground">Meeting OS</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Before: agenda and decisions needed. After: capture outcomes and action items (no raw email stored). Optional
          calendar event id for tie-out.
        </p>
        {isFounder ? (
          <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/15 p-3">
            <Input placeholder="Meeting title" value={meetTitle} onChange={(e) => setMeetTitle(e.target.value)} />
            <Input type="datetime-local" value={meetWhen} onChange={(e) => setMeetWhen(e.target.value)} />
            <textarea
              className="min-h-[64px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Agenda (before)"
              value={meetAgenda}
              onChange={(e) => setMeetAgenda(e.target.value)}
            />
            <textarea
              className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Decisions needed (before)"
              value={meetDecisionsNeeded}
              onChange={(e) => setMeetDecisionsNeeded(e.target.value)}
            />
            <Button type="button" size="sm" onClick={() => void postMeeting()}>
              Add meeting
            </Button>
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          {v2.meetings.map((m) => (
            <li key={m.id} className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm shadow-sm">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => setOpenMeetingId((x) => (x === m.id ? null : m.id))}
              >
                <span className="font-medium text-foreground">{m.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {m.phase}
                  {m.scheduled_at ? ` · ${new Date(m.scheduled_at).toLocaleString()}` : ""}
                </span>
              </button>
              {openMeetingId === m.id ? (
                <div className="mt-3 space-y-2 border-t border-border/50 pt-2 text-xs">
                  <div>
                    <div className="font-medium text-muted-foreground">Before</div>
                    {m.before_agenda ? <p className="whitespace-pre-wrap">{m.before_agenda}</p> : <p className="text-muted-foreground">—</p>}
                    <div className="mt-1 font-medium text-muted-foreground">Decisions needed</div>
                    {m.before_decisions_needed ? (
                      <p className="whitespace-pre-wrap">{m.before_decisions_needed}</p>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-muted-foreground">After</div>
                    {m.after_decisions_summary ? (
                      <p className="whitespace-pre-wrap">{m.after_decisions_summary}</p>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                    <div className="mt-1 text-muted-foreground">Action items (JSON)</div>
                    <pre className="max-h-32 overflow-auto rounded bg-muted/40 p-2 text-[10px]">
                      {JSON.stringify(m.after_action_items ?? [], null, 2)}
                    </pre>
                  </div>
                  {isFounder ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="min-h-[72px] w-full rounded-md border border-border bg-background px-2 py-1.5"
                        placeholder="Decisions summary (after)"
                        defaultValue={m.after_decisions_summary ?? ""}
                        id={`after-dec-${m.id}`}
                      />
                      <textarea
                        className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5"
                        placeholder='Action items JSON array, e.g. [{"title":"Ship v2","owner_label":"Alex","due_date":"2026-04-15"}]'
                        defaultValue={
                          Array.isArray(m.after_action_items)
                            ? JSON.stringify(m.after_action_items, null, 2)
                            : "[]"
                        }
                        id={`after-act-${m.id}`}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          onClick={() => {
                            const el = document.getElementById(`after-dec-${m.id}`) as HTMLTextAreaElement | null;
                            const el2 = document.getElementById(`after-act-${m.id}`) as HTMLTextAreaElement | null;
                            let items: unknown = [];
                            try {
                              items = el2?.value ? JSON.parse(el2.value) : [];
                            } catch {
                              return;
                            }
                            void patchMeeting(m.id, {
                              after_decisions_summary: el?.value ?? null,
                              after_action_items: items,
                              phase: "completed",
                            });
                          }}
                        >
                          Save after-notes &amp; complete
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          onClick={() => void deleteMeeting(m.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
