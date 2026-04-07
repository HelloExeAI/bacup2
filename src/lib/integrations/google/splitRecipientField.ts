/** Split "a@x.com, bo" → before "a@x.com, ", current "bo" (token after last comma). */
export function splitLastRecipient(value: string): { before: string; current: string } {
  const lastComma = value.lastIndexOf(",");
  if (lastComma < 0) return { before: "", current: value };
  return {
    before: value.slice(0, lastComma + 1),
    current: value.slice(lastComma + 1).trimStart(),
  };
}
