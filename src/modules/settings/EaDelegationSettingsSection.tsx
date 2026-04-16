"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/userStore";
import type { TeamMemberSummary } from "@/modules/settings/types";
import { formatPersonWithDepartment } from "@/lib/workspace/departments";

type EaPolicyRow = {
  ea_user_id: string;
  can_view_email_derived_tasks?: boolean;
  can_view_calendar_summary?: boolean;
  can_view_decisions?: boolean;
  can_view_projects?: boolean;
  can_view_recognition_feed?: boolean;
};

export function EaDelegationSettingsSection({ teamMembers }: { teamMembers: TeamMemberSummary[] }) {
  const user = useUserStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);

  const [ownerOk, setOwnerOk] = React.useState<boolean | null>(null);
  const [eaPolicies, setEaPolicies] = React.useState<EaPolicyRow[]>([]);
  const [eaTarget, setEaTarget] = React.useState("");
  const [eaFlags, setEaFlags] = React.useState({
    can_view_email_derived_tasks: false,
    can_view_calendar_summary: false,
    can_view_decisions: true,
    can_view_projects: false,
    can_view_recognition_feed: false,
  });

  const load = React.useCallback(async () => {
    setOwnerOk(null);
    const res = await fetch("/api/workspace/ea-policy", { credentials: "include" });
    if (res.status === 403) {
      setOwnerOk(false);
      return;
    }
    if (!res.ok) {
      setOwnerOk(false);
      return;
    }
    setOwnerOk(true);
    const j = (await res.json().catch(() => null)) as { policies?: EaPolicyRow[] } | null;
    setEaPolicies(Array.isArray(j?.policies) ? j.policies : []);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const departmentByUserId = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const row of teamMembers) {
      if (row.member_user_id && row.department) m[row.member_user_id] = row.department;
    }
    return m;
  }, [teamMembers]);

  const displayName = React.useCallback(
    (uid: string) => {
      if (uid === user?.id) return profile?.display_name?.trim() || profile?.name?.trim() || "You";
      const row = teamMembers.find((t) => t.member_user_id === uid);
      return row?.display_name?.trim() || `${uid.slice(0, 8)}…`;
    },
    [teamMembers, profile?.display_name, profile?.name, user?.id],
  );

  const personLabel = React.useCallback(
    (uid: string) => formatPersonWithDepartment(displayName(uid), departmentByUserId[uid] ?? null),
    [departmentByUserId, displayName],
  );

  const memberIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    for (const m of teamMembers) {
      if (m.member_user_id) ids.add(m.member_user_id);
    }
    return Array.from(ids);
  }, [teamMembers, user?.id]);

  const saveEaPolicy = async () => {
    if (!eaTarget) return;
    const res = await fetch("/api/workspace/ea-policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ea_user_id: eaTarget,
        ...eaFlags,
        can_view_projects: false,
        can_view_recognition_feed: false,
      }),
    });
    if (res.ok) void load();
  };

  if (ownerOk === null) {
    return <p className="text-xs text-muted-foreground">Loading EA delegation…</p>;
  }

  if (!ownerOk) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-[#E0DDD6] pt-4 dark:border-[hsl(35_10%_28%)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">EA delegation</div>
      <p className="text-xs text-muted-foreground">
        Choose an EA team member and set what they can see in your workspace hub.
      </p>
      {eaPolicies.length > 0 ? (
        <ul className="text-[11px] text-muted-foreground">
          {eaPolicies.map((p) => (
            <li key={String(p.ea_user_id)}>
              EA {personLabel(String(p.ea_user_id))}: decisions {String(p.can_view_decisions)}, email tasks{" "}
              {String(p.can_view_email_derived_tasks)}, calendar {String(p.can_view_calendar_summary)}
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
                {personLabel(id)}
              </option>
            ))}
        </select>
        {(
          [
            ["can_view_email_derived_tasks", "Email-derived tasks (metadata)"],
            ["can_view_calendar_summary", "Calendar summary"],
            ["can_view_decisions", "Decisions"],
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
  );
}
