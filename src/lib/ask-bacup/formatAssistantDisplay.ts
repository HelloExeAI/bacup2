/**
 * Turns Markdown ATX headings into typographic section markers so the UI never shows raw `###`.
 * Assistant messages only; keeps **bold**, lists, etc. as plain text.
 */
export function formatAskBacupAssistantDisplay(text: string): string {
  if (!text) return text;
  return text.replace(/^(\#{1,6})\s+(.+)$/gm, (_, hashes: string, title: string) => {
    const n = hashes.length;
    if (n >= 4) return `▸ ${title}`;
    if (n === 3) return `→ ${title}`;
    if (n === 2) return `➤ ${title}`;
    return `◆ ${title}`;
  });
}
