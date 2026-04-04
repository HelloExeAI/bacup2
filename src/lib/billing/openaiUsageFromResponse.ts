export type OpenAIUsageSlice = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export function extractOpenAIUsageFromChatCompletion(body: unknown): OpenAIUsageSlice | null {
  if (!body || typeof body !== "object") return null;
  const u = (body as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const prompt = Number((u as { prompt_tokens?: unknown }).prompt_tokens);
  const completion = Number((u as { completion_tokens?: unknown }).completion_tokens);
  const total = Number((u as { total_tokens?: unknown }).total_tokens);
  const p = Number.isFinite(prompt) ? Math.max(0, Math.floor(prompt)) : 0;
  const c = Number.isFinite(completion) ? Math.max(0, Math.floor(completion)) : 0;
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : p + c;
  if (p === 0 && c === 0 && t === 0) return null;
  return { promptTokens: p, completionTokens: c, totalTokens: t > 0 ? t : p + c };
}
