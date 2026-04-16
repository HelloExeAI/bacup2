/** Fixed department taxonomy for Team Setup (workspace-scoped assignments). */

export const REVENUE_DEPARTMENTS = ["operations", "sales", "marketing"] as const;
export const SUPPORT_DEPARTMENTS = ["people", "finance", "admin", "it"] as const;
/** Leadership / exec titles mapped like departments in Team Setup (not the same as workspace owner). */
export const MANAGEMENT_DEPARTMENTS = ["founder", "cofounder", "ceo"] as const;

export const WORKSPACE_DEPARTMENTS = [
  ...REVENUE_DEPARTMENTS,
  ...SUPPORT_DEPARTMENTS,
  ...MANAGEMENT_DEPARTMENTS,
] as const;

export type WorkspaceDepartmentId = (typeof WORKSPACE_DEPARTMENTS)[number];
export type WorkspaceVerticalId = "revenue" | "support" | "management";

export const DEPARTMENT_VERTICAL: Record<WorkspaceDepartmentId, WorkspaceVerticalId> = {
  operations: "revenue",
  sales: "revenue",
  marketing: "revenue",
  people: "support",
  finance: "support",
  admin: "support",
  it: "support",
  founder: "management",
  cofounder: "management",
  ceo: "management",
};

export const DEPARTMENT_LABEL: Record<WorkspaceDepartmentId, string> = {
  operations: "Operations",
  sales: "Sales",
  marketing: "Marketing",
  people: "People",
  finance: "Finance",
  admin: "Admin",
  it: "IT",
  founder: "Founder",
  cofounder: "Cofounder",
  ceo: "CEO",
};

export const VERTICAL_LABEL: Record<WorkspaceVerticalId, string> = {
  revenue: "Revenue",
  support: "Support",
  management: "Management",
};

const DEPT_SET = new Set<string>(WORKSPACE_DEPARTMENTS);

export function isWorkspaceDepartmentId(v: string): v is WorkspaceDepartmentId {
  return DEPT_SET.has(v);
}

export function verticalForDepartment(d: WorkspaceDepartmentId): WorkspaceVerticalId {
  return DEPARTMENT_VERTICAL[d];
}

/** "Name · Sales" when department is set. */
export function formatPersonWithDepartment(
  displayName: string,
  department: WorkspaceDepartmentId | string | null | undefined,
): string {
  const name = displayName.trim() || "Member";
  if (!department || !isWorkspaceDepartmentId(department)) return name;
  return `${name} · ${DEPARTMENT_LABEL[department]}`;
}
