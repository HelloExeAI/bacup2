/**
 * OpenAI extraction for Gmail bodies — mirrors scratchpad extract shape.
 */

export type ExtractedEmailTask = {
  title: string;
  type: "todo" | "followup" | "reminder";
  due_date: string | null;
  due_time: string | null;
  assigned_to: string;
};

function professionalizeTitle(input: string) {
  let s = input.trim();
  if (!s) return s;
  s = s.replace(/^\s*[\-\*\u2022]\s+/, "").replace(/^\s*\[\s?\]\s*/, "").replace(/\s+/g, " ");
  s = s
    .replace(/\basap\b/gi, "as soon as possible")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bmsg\b/gi, "message")
    .replace(/\bfu\b/gi, "follow up");
  const imperativeStarters = [
    "call",
    "send",
    "email",
    "message",
    "follow up",
    "schedule",
    "review",
    "prepare",
    "submit",
    "share",
    "update",
    "remind",
  ];
  const lower = s.toLowerCase();
  for (const starter of imperativeStarters) {
    if (lower.startsWith(starter)) {
      s = `${starter[0]!.toUpperCase()}${starter.slice(1)}${s.slice(starter.length)}`;
      break;
    }
  }
  s = s.replace(/[;,:]\s*$/g, "").trim();
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  if (s.length > 120) s = `${s.slice(0, 119).trimEnd()}…`;
  return s;
}

function isSelfAssignee(value: string | null | undefined) {
  return !value || value.trim().toLowerCase() === "self";
}

function parseJsonArrayFromModel(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf("[");
  const last = trimmed.lastIndexOf("]");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  return [];
}

function parseJsonObjectFromModel(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  try {
    const j = JSON.parse(trimmed);
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      const j = JSON.parse(fenced[1]);
      return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const j = JSON.parse(trimmed.slice(first, last + 1));
      return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function coerceTasks(json: unknown): ExtractedEmailTask[] {
  if (!Array.isArray(json)) return [];
  const out: ExtractedEmailTask[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const typeRaw = typeof it.type === "string" ? it.type : "todo";
    const type =
      typeRaw === "followup" || typeRaw === "reminder" || typeRaw === "todo" ? typeRaw : "todo";
    const due_date =
      typeof it.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.due_date) ? it.due_date : null;
    const due_time =
      typeof it.due_time === "string" && /^\d{2}:\d{2}/.test(it.due_time) ? it.due_time.slice(0, 5) : null;
    const assigned_to =
      typeof it.assigned_to === "string" && it.assigned_to.trim() ? it.assigned_to.trim() : "self";
    if (!title) continue;
    const normalizedType = !isSelfAssignee(assigned_to) && type === "todo" ? "followup" : type;
    out.push({
      title: professionalizeTitle(title),
      type: normalizedType,
      due_date,
      due_time,
      assigned_to,
    });
  }
  return out;
}

export type EmailAiResult = {
  summary: string;
  tasks: ExtractedEmailTask[];
  /** Present when the OpenAI request succeeded; used for billing meters. */
  openaiTotalTokens?: number;
};

const MAX_BODY_CHARS = 14_000;

export async function extractFromEmailWithOpenAI(params: {
  apiKey: string;
  emailBody: string;
  subject: string;
  fromLine: string;
  defaultDueYmd: string;
  /** When true, model must return a one-line inbox summary for the notification tray. */
  wantInboundSummary: boolean;
}): Promise<EmailAiResult> {
  const body = params.emailBody.length > MAX_BODY_CHARS
    ? `${params.emailBody.slice(0, MAX_BODY_CHARS)}\n\n[truncated]`
    : params.emailBody;

  const system = `You are Bacup Email Intelligence.

Analyze the email and extract actionable work items.

Rules:
- Only create tasks for clearly actionable items from real work context: direct requests from people the user deals with, deadlines, genuine commitments, real follow-ups.
- NEVER create tasks for: job-board or job-alert emails ("apply for … position", "job recommendations", career-site digests), banking or investment promotions, credit-card offers, mutual funds/SIP marketing, webinar or course promotions, satisfaction/feedback surveys, newsletter call-to-actions, automated social/job digest emails, or anything that is clearly mass marketing.
- If the email is only nudging the user to apply to jobs, invest, enroll in a course, join a webinar, or complete a survey, return an empty tasks array and keep summary neutral or empty.
- Ignore signatures, disclaimers, marketing fluff, and pure FYI content.
- If nothing actionable exists, return an empty tasks array.
- Return JSON ONLY with this exact shape:
  {"summary": string, "tasks": Array<{title,type,due_date,due_time,assigned_to}>}
- summary: ${
    params.wantInboundSummary
      ? "One concise line (max 140 chars) describing what the email is about / what matters. No quotes."
      : 'Empty string ""'
  }
- tasks: same rules as Bacup scratchpad — title imperative and polished; type todo|followup|reminder; due_date YYYY-MM-DD or null; due_time HH:MM or null; assigned_to default "self".
- If a due date is implied as "today", use the provided default_due_ymd.
- Keep task titles under 90 characters.`;

  const userMsg = `default_due_ymd: ${params.defaultDueYmd}

Subject: ${params.subject}

From: ${params.fromLine}

Body:
${body}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 900,
    }),
  });

  const respJson = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg =
      typeof respJson?.error?.message === "string" ? respJson.error.message : "OpenAI request failed";
    throw new Error(msg);
  }

  const content: string =
    respJson?.choices?.[0]?.message?.content ?? respJson?.choices?.[0]?.message?.text ?? "";

  const usage = respJson?.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
  const openaiTotalTokens =
    typeof usage?.total_tokens === "number"
      ? Math.max(0, Math.floor(usage.total_tokens))
      : typeof usage?.prompt_tokens === "number" || typeof usage?.completion_tokens === "number"
        ? Math.max(0, Math.floor(Number(usage?.prompt_tokens ?? 0) + Number(usage?.completion_tokens ?? 0)))
        : undefined;

  const obj = parseJsonObjectFromModel(content);
  const summaryRaw = obj && typeof obj.summary === "string" ? obj.summary.trim() : "";
  const summary =
    params.wantInboundSummary
      ? summaryRaw.length > 200
        ? `${summaryRaw.slice(0, 199).trimEnd()}…`
        : summaryRaw
      : "";

  const tasks = coerceTasks(obj?.tasks ?? parseJsonArrayFromModel(content));
  return { summary, tasks: tasks.slice(0, 25), openaiTotalTokens };
}
