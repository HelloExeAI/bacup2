"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DEPARTMENT_LABEL,
  REVENUE_DEPARTMENTS,
  SUPPORT_DEPARTMENTS,
  type WorkspaceDepartmentId,
} from "@/lib/workspace/departments";

type PersonRow = {
  user_id: string;
  label: string;
  team_member_id: string | null;
  can_manage_business_setup: boolean;
  department: string | null;
};

type GetPayload = {
  workspace_owner_id: string;
  can_edit: boolean;
  is_founder_viewer: boolean;
  people: PersonRow[];
  error?: string;
};

export function BusinessSetupTab() {
  const [payload, setPayload] = React.useState<GetPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [deptByUser, setDeptByUser] = React.useState<Record<string, WorkspaceDepartmentId>>({});
  const [setupPermByUser, setSetupPermByUser] = React.useState<Record<string, boolean>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    try {
      const res = await fetch("/api/workspace/business-setup", { credentials: "include" });
      const j = (await res.json().catch(() => null)) as GetPayload & { error?: string; details?: string };
      if (!res.ok) {
        const code = j?.error;
        if (res.status === 403 && code === "business_os_not_entitled") {
          setErr("Business Setup is available on Executive OS.");
          setPayload(null);
          return;
        }
        const detail = typeof j?.details === "string" && j.details.trim() ? ` ${j.details.trim()}` : "";
        throw new Error(
          typeof code === "string" && code.trim() ? `${code.trim()}${detail}` : `Failed to load (${res.status})${detail}`,
        );
      }
      setPayload(j);
      const d: Record<string, WorkspaceDepartmentId> = {};
      const p: Record<string, boolean> = {};
      for (const row of j.people ?? []) {
        if (row.department && isDept(row.department)) d[row.user_id] = row.department;
        if (row.team_member_id) p[row.user_id] = Boolean(row.can_manage_business_setup);
      }
      setDeptByUser(d);
      setSetupPermByUser(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!payload?.can_edit || !payload.people.length) return;

    setSaving(true);
    setErr(null);
    setNotice(null);
    try {
      const assignments = payload.people.map((row) => {
        const d = deptByUser[row.user_id];
        if (!d) throw new Error(`Choose a department for ${row.label}`);
        return { user_id: row.user_id, department: d };
      });

      const body: {
        assignments: typeof assignments;
        setup_permissions?: { member_user_id: string; can_manage_business_setup: boolean }[];
      } = { assignments };

      if (payload.is_founder_viewer) {
        body.setup_permissions = payload.people
          .filter((row) => row.team_member_id && row.user_id !== payload.workspace_owner_id)
          .map((row) => ({
            member_user_id: row.user_id,
            can_manage_business_setup: Boolean(setupPermByUser[row.user_id]),
          }));
      }

      const res = await fetch("/api/workspace/business-setup", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Save failed");
      setNotice("Saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (err && !payload) {
    return <div className="text-sm text-red-700 dark:text-red-300">{err}</div>;
  }

  if (!payload) {
    return <div className="text-sm text-muted-foreground">Nothing to show.</div>;
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Map everyone in your workspace to a department under <span className="font-medium">Revenue</span> or{" "}
        <span className="font-medium">Support</span>. This drives labels in the cockpit, workspace hub, and team
        settings.
      </p>

      <div className="rounded-lg border border-[#E0DDD6] bg-white/50 px-3 py-2 text-xs dark:border-[hsl(35_10%_28%)] dark:bg-black/20">
        <div className="font-semibold text-foreground">Structure</div>
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          <li>Revenue — Operations, Sales, Marketing</li>
          <li>Support — People, Finance, Admin, IT</li>
        </ul>
      </div>

      {!payload.can_edit ? (
        <p className="rounded-md border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          You can view assignments. Only the workspace founder or a member with{" "}
          <strong>Can manage Business Setup</strong> can edit.
        </p>
      ) : null}

      {err ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/[0.1] px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="space-y-2">
        {payload.people.map((row) => (
          <div
            key={row.user_id}
            className="flex flex-col gap-2 rounded-md border border-[#E0DDD6] bg-white/60 px-3 py-2 text-xs dark:border-[hsl(35_10%_28%)] dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground">{row.label}</div>
              {row.user_id === payload.workspace_owner_id ? (
                <div className="text-[10px] text-muted-foreground">Founder</div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {payload.is_founder_viewer && row.team_member_id ? (
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(setupPermByUser[row.user_id])}
                    disabled={!payload.can_edit}
                    onChange={(e) =>
                      setSetupPermByUser((prev) => ({ ...prev, [row.user_id]: e.target.checked }))
                    }
                  />
                  Setup admin
                </label>
              ) : null}
              {payload.can_edit ? (
                <select
                  className="h-8 min-w-[10rem] rounded-md border border-border bg-background px-2 text-xs"
                  value={deptByUser[row.user_id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v || !isDept(v)) return;
                    setDeptByUser((prev) => ({ ...prev, [row.user_id]: v }));
                  }}
                >
                  <option value="">Select department…</option>
                  <optgroup label="Revenue">
                    {REVENUE_DEPARTMENTS.map((id) => (
                      <option key={id} value={id}>
                        {DEPARTMENT_LABEL[id]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Support">
                    {SUPPORT_DEPARTMENTS.map((id) => (
                      <option key={id} value={id}>
                        {DEPARTMENT_LABEL[id]}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <span className="text-muted-foreground">
                  {row.department && isDept(row.department) ? DEPARTMENT_LABEL[row.department] : "—"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {payload.can_edit ? (
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      ) : null}
    </div>
  );
}

function isDept(v: string): v is WorkspaceDepartmentId {
  return (
    (REVENUE_DEPARTMENTS as readonly string[]).includes(v) || (SUPPORT_DEPARTMENTS as readonly string[]).includes(v)
  );
}
