/**
 * Developer accounts bypass product plan gates (Business OS, Ask Bacup, etc.).
 *
 * - Built-in list for known dev/staging identities.
 * - Optional `BACUP_DEVELOPER_EMAILS` env: comma-separated emails (case-insensitive).
 */

const BUILT_IN_DEVELOPER_EMAILS = new Set(["a@b.com"].map((e) => e.toLowerCase()));

function parseEnvDeveloperEmails(): Set<string> {
  const raw = process.env.BACUP_DEVELOPER_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function mergedDeveloperEmails(): Set<string> {
  return new Set([...BUILT_IN_DEVELOPER_EMAILS, ...parseEnvDeveloperEmails()]);
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return mergedDeveloperEmails().has(email.trim().toLowerCase());
}
