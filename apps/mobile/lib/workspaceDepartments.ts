/** Same taxonomy as `src/lib/workspace/departments.ts` for Team Setup UI. */

export const REVENUE_DEPARTMENTS = ["operations", "sales", "marketing"] as const;
export const SUPPORT_DEPARTMENTS = ["people", "finance", "admin", "it"] as const;
export const MANAGEMENT_DEPARTMENTS = ["founder", "cofounder", "ceo"] as const;

export const WORKSPACE_DEPARTMENTS = [
  ...REVENUE_DEPARTMENTS,
  ...SUPPORT_DEPARTMENTS,
  ...MANAGEMENT_DEPARTMENTS,
] as const;

export type WorkspaceDepartmentId = (typeof WORKSPACE_DEPARTMENTS)[number];

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

const DEPT_SET = new Set<string>(WORKSPACE_DEPARTMENTS);

export function isWorkspaceDepartmentId(v: string): v is WorkspaceDepartmentId {
  return DEPT_SET.has(v);
}
