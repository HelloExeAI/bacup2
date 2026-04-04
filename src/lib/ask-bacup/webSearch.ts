export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchCredentials =
  | { provider: "tavily"; apiKey: string }
  | { provider: "serper"; apiKey: string };

/** Prefer wire-style and major outlets when the API supports domain hints. */
const RELIABLE_NEWS_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "npr.org",
  "theguardian.com",
  "nytimes.com",
  "ft.com",
  "economist.com",
  "aljazeera.com",
  "pbs.org",
];

export function getAskBacupSearchCredentials(): SearchCredentials | null {
  const tavily = process.env.TAVILY_API_KEY?.trim();
  if (tavily) return { provider: "tavily", apiKey: tavily };
  const serper = process.env.SERPER_API_KEY?.trim();
  if (serper) return { provider: "serper", apiKey: serper };
  return null;
}

function mergeQueries(queries: string[], fallback: string): string {
  const cleaned = queries.map((q) => q.trim()).filter(Boolean);
  const joined = cleaned.length > 0 ? cleaned.join(" ") : fallback;
  return joined.slice(0, 400);
}

async function searchTavily(query: string, apiKey: string): Promise<WebHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 10,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[ask-bacup webSearch] Tavily error", res.status, t.slice(0, 200));
    return [];
  }
  const j = (await res.json().catch(() => null)) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  const rows = j?.results ?? [];
  return rows
    .map((r) => ({
      title: String(r.title ?? "").trim() || "Untitled",
      url: String(r.url ?? "").trim(),
      snippet: String(r.content ?? "").trim().replace(/\s+/g, " ").slice(0, 900),
    }))
    .filter((h) => h.url.startsWith("http"));
}

async function searchSerper(query: string, apiKey: string): Promise<WebHit[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[ask-bacup webSearch] Serper error", res.status, t.slice(0, 200));
    return [];
  }
  const j = (await res.json().catch(() => null)) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
  };
  const rows = j?.organic ?? [];
  return rows
    .map((r) => ({
      title: String(r.title ?? "").trim() || "Untitled",
      url: String(r.link ?? "").trim(),
      snippet: String(r.snippet ?? "").trim().replace(/\s+/g, " ").slice(0, 900),
    }))
    .filter((h) => h.url.startsWith("http"));
}

function scoreHitDomain(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (RELIABLE_NEWS_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 2;
    return 0;
  } catch {
    return 0;
  }
}

/** Deduplicate by URL, prefer reputable domains, cap at `limit`. */
export function pickTopWebHits(hits: WebHit[], limit: number): WebHit[] {
  const seen = new Set<string>();
  const unique: WebHit[] = [];
  for (const h of hits) {
    const key = h.url.split("#")[0] ?? h.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
  }
  unique.sort((a, b) => scoreHitDomain(b.url) - scoreHitDomain(a.url));
  return unique.slice(0, limit);
}

export async function fetchWebHitsForAskBacup(
  creds: SearchCredentials,
  queries: string[],
  fallbackUserMessage: string,
): Promise<WebHit[]> {
  const q = mergeQueries(queries, fallbackUserMessage.trim().slice(0, 280));
  if (!q) return [];
  const raw =
    creds.provider === "tavily"
      ? await searchTavily(q, creds.apiKey)
      : await searchSerper(q, creds.apiKey);
  return pickTopWebHits(raw, 3);
}

export function formatWebHitsForPrompt(hits: WebHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map((h, i) => {
      const n = i + 1;
      return `[${n}] ${h.title}\nURL: ${h.url}\nExcerpt: ${h.snippet}`;
    })
    .join("\n\n");
}

type RouterJson = { needs_web?: boolean; queries?: string[] };

export async function planAskBacupWebResearch(params: {
  userMessage: string;
  openaiApiKey: string;
  model: string;
}): Promise<{ shouldSearch: boolean; queries: string[]; routerPromptTokens: number; routerCompletionTokens: number }> {
  const creds = getAskBacupSearchCredentials();
  if (!creds) {
    return { shouldSearch: false, queries: [], routerPromptTokens: 0, routerCompletionTokens: 0 };
  }

  const system = `You route web research for Ask Bacup. Reply with JSON only: {"needs_web":boolean,"queries":string[]}

Set needs_web to true when the user would benefit from fresh web sources: breaking or current news, ongoing conflicts, politics, recent disasters, markets or prices in recent days, sports or election results, laws or regulations that may have changed, product or company updates, or any factual question where details may have changed after 2024.

Set needs_web to false only for: greetings, pure brainstorming, code/math explanations, rewriting or summarizing text they supplied, timeless concepts, or questions that are clearly only about their own app data (the app sends workspace context separately).

queries: 1–3 short English search phrases optimized for reputable news and reference results (no PII). Use [] if needs_web is false.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: params.userMessage.slice(0, 4000) },
      ],
    }),
  });

  const usage = { prompt: 0, completion: 0 };
  if (!res.ok) {
    console.warn("[ask-bacup webSearch] router OpenAI error", res.status);
    return { shouldSearch: false, queries: [], routerPromptTokens: 0, routerCompletionTokens: 0 };
  }

  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  usage.prompt = body?.usage?.prompt_tokens ?? 0;
  usage.completion = body?.usage?.completion_tokens ?? 0;

  let parsed: RouterJson = {};
  try {
    const text = body?.choices?.[0]?.message?.content ?? "{}";
    parsed = JSON.parse(text) as RouterJson;
  } catch {
    parsed = {};
  }

  const needs = Boolean(parsed.needs_web);
  const queries = Array.isArray(parsed.queries)
    ? parsed.queries.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
    : [];

  if (!needs) {
    return {
      shouldSearch: false,
      queries: [],
      routerPromptTokens: usage.prompt,
      routerCompletionTokens: usage.completion,
    };
  }

  return {
    shouldSearch: true,
    queries: queries.length > 0 ? queries : [params.userMessage.trim().slice(0, 200)],
    routerPromptTokens: usage.prompt,
    routerCompletionTokens: usage.completion,
  };
}
