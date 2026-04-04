/**
 * Conservative skip for obvious promotional/bulk mail so we don't waste AI or notify noise.
 * When in doubt, we process (run AI) so important mail is not missed.
 */

/** If the user (or Gmail) flagged the thread — always run AI. */
const NEVER_SKIP_LABELS = new Set(["STARRED", "IMPORTANT"]);

/** Gmail tab categories — we only auto-skip from Promotions, not Updates (receipts/orders) or Primary. */
const PROMOTIONS = "CATEGORY_PROMOTIONS";

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function hasBulkMarketingHeaders(headers: Record<string, string>): boolean {
  const h = headers;
  const get = (name: string) => norm(h[name]);

  if (get("list-unsubscribe") || get("list-unsubscribe-post")) return true;

  if (get("precedence") === "bulk") return true;

  const auto = get("auto-submitted");
  if (auto.includes("auto-generated") && !auto.includes("auto-replied")) return true;

  return false;
}

export type PromotionalSkipDecision = {
  /** When true: no AI, no tasks, no inbox notification; message still marked processed. */
  skip: boolean;
  reason?: "promotions_with_bulk_headers";
};

/**
 * Skip only when Gmail put the message in Promotions **and** typical bulk/newsletter headers exist.
 * Starred / Important always processed. Promotions without bulk headers still processed (misfiled deals, etc.).
 */
export function shouldSkipPromotionalProcessing(
  labelIds: string[],
  headers: Record<string, string>,
): PromotionalSkipDecision {
  const labels = new Set(labelIds.map((l) => l.toUpperCase()));

  for (const n of NEVER_SKIP_LABELS) {
    if (labels.has(n)) {
      return { skip: false };
    }
  }

  if (!labels.has(PROMOTIONS)) {
    return { skip: false };
  }

  if (!hasBulkMarketingHeaders(headers)) {
    return { skip: false };
  }

  return { skip: true, reason: "promotions_with_bulk_headers" };
}
