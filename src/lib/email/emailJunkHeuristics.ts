/**
 * Detect low-value email streams that should not become tasks or inbox notifications.
 * Tuned for job-board alerts, banking promos, webinars, surveys — not personal work mail.
 */

const NEVER_SKIP_LABELS = new Set(["STARRED", "IMPORTANT"]);

function buildBlob(params: {
  subject: string;
  fromLine: string;
  bodyText: string;
  snippet: string;
  headers: Record<string, string>;
}): string {
  const listUnsub = params.headers["list-unsubscribe"] ?? params.headers["list-unsubscribe-post"] ?? "";
  return [params.subject, params.fromLine, params.bodyText, params.snippet, listUnsub].join("\n").toLowerCase();
}

/** Whole-message skip: no AI, no tasks, no notification. */
export function shouldSkipLowValueEmailStream(params: {
  labelIds: string[];
  subject: string;
  fromLine: string;
  bodyText: string;
  snippet: string;
  headers: Record<string, string>;
}): { skip: boolean; reason?: string } {
  const labels = new Set(params.labelIds.map((l) => l.toUpperCase()));
  for (const n of NEVER_SKIP_LABELS) {
    if (labels.has(n)) return { skip: false };
  }

  const blob = buildBlob(params);

  const hit = (re: RegExp) => re.test(blob);

  if (
    hit(/\bapply\s+for\b.+\bat\s+[A-Za-z0-9]/) ||
    hit(/\bapply\s+for\b.+\bposition\s+in\b/) ||
    hit(/\bapply\s+for\b.+\bposition\s+at\b/) ||
    hit(/\breview\s+job\s+recommendations?\b/) ||
    hit(/\bapply\s+for\s+recommended\s+jobs\b/) ||
    hit(/\bupdate\s+.+\s+profile\b.+\bapply\s+for\b/) ||
    hit(/\brecommended\s+jobs\b.*\b(iimjobs|naukri|shine|indeed|linkedin|foundit|instahyre|monster)\b/)
  ) {
    return { skip: true, reason: "job_alert_or_board" };
  }

  if (hit(/\b(iimjobs|foundit|instahyre)\b/) && hit(/\b(job|career|apply)\b/)) {
    return { skip: true, reason: "job_board_brand" };
  }

  if (
    hit(/\bconsider\s+investing\b/) ||
    hit(/\bmutual\s+fund\b/) ||
    hit(/\bnippon\s+india\b/) ||
    hit(/\binvestment\s+(?:tip|opportunity|idea)\b/) ||
    hit(/\bcredit\s+card\s+(?:offer|reward)\b/) ||
    hit(/\bpre-approved\s+loan\b/)
  ) {
    return { skip: true, reason: "banking_or_investment_promo" };
  }

  if (
    hit(/\bjoin\s+(?:the\s+)?webinar\b/) ||
    hit(/\bconsider\s+enrolling\b/) ||
    hit(/\bprofessional\s+certificate\s+program\b/) ||
    hit(/\benroll\s+(?:now|today)\b.*\b(iit|iim|university|course)\b/)
  ) {
    return { skip: true, reason: "webinar_or_course_promo" };
  }

  if (
    hit(/\bfeedback\s+survey\b/) ||
    hit(/\brate\s+your\s+experience\b/) ||
    hit(/\bsatisfaction\s+survey\b/) ||
    hit(/\bhow\s+did\s+we\s+do\b/)
  ) {
    return { skip: true, reason: "feedback_or_survey" };
  }

  if (hit(/\bview\s+the\s+rendered\s+video\b/) || hit(/\bwatch\s+the\s+recording\s+now\b/)) {
    return { skip: true, reason: "engagement_noise" };
  }

  if (labels.has("CATEGORY_SOCIAL")) {
    if (
      /\blist-unsubscribe\b/i.test(blob) ||
      hit(/\bjob\b.*\b(alert|digest|recommendation)\b/) ||
      hit(/\blinkedin\b.*\b(job|career)\b/)
    ) {
      return { skip: true, reason: "social_tab_digest" };
    }
  }

  return { skip: false };
}

/** Post-filter AI output — drop titles that look like junk anyway. */
export function filterJunkTaskTitles<T extends { title: string }>(tasks: T[]): T[] {
  return tasks.filter((t) => !isJunkTaskTitle(t.title));
}

/** Used by cleanup API + post-AI filter. */
export function isJunkTaskTitle(title: string): boolean {
  const s = title.trim().toLowerCase();
  if (!s) return true;

  if (
    /\bapply\s+for\b.+\bat\s+/.test(s) ||
    /\bapply\s+for\b.+\bposition\s+in\b/.test(s) ||
    /\bapply\s+for\b.+\bposition\s+at\b/.test(s) ||
    /\breview\s+job\s+recommendations?\b/.test(s) ||
    /\bapply\s+for\s+recommended\s+jobs\b/.test(s) ||
    /\bupdate\s+.+\s+profile\b.+\bapply\b/.test(s) ||
    /\bconsider\s+(enrolling|investing)\b/.test(s) ||
    /\bjoin\s+(?:the\s+)?webinar\b/.test(s) ||
    /\bmutual\s+fund\b/.test(s) ||
    /\bfeedback\s+survey\b/.test(s) ||
    /\bview\s+the\s+rendered\s+video\b/.test(s)
  ) {
    return true;
  }

  if (
    /\bapply\s+for\b/.test(s) &&
    /\bposition\b/.test(s) &&
    /\b(in|at)\b/.test(s) &&
    /\b(gurgaon|delhi|mumbai|hyderabad|bangalore|bengaluru|ahmedabad|gujarat|ncr|pune|chennai|kolkata|raipur)\b/i.test(
      s,
    )
  ) {
    return true;
  }

  return false;
}

/** Pending email-sourced tasks safe to bulk-remove. */
export function isJunkEmailSourcedTaskRow(row: {
  title: string;
  description: string | null;
  source?: string | null;
}): boolean {
  if (row.source && row.source !== "email") return false;
  if (isJunkTaskTitle(row.title)) return true;
  const desc = row.description ?? "";
  const fromEmail = desc.replace(/^[\s\S]*?from email:\s*/i, "").split("\n")[0]?.trim() ?? "";
  if (fromEmail && isJunkTaskTitle(fromEmail)) return true;
  return false;
}
