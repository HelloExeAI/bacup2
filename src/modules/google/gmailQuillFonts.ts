/**
 * Quill font picker: alphabetically sorted display names, slug must match CSS in ./gmailQuillFonts.css.
 * Default font for new content: Montserrat (see GMAIL_DEFAULT_FONT).
 */
const FONT_ENTRIES: { slug: string; label: string }[] = [
  { slug: "arial", label: "Arial" },
  { slug: "arial-black", label: "Arial Black" },
  { slug: "calibri", label: "Calibri" },
  { slug: "candara", label: "Candara" },
  { slug: "comic-sans", label: "Comic Sans MS" },
  { slug: "consolas", label: "Consolas" },
  { slug: "corbel", label: "Corbel" },
  { slug: "courier-new", label: "Courier New" },
  { slug: "franklin", label: "Franklin Gothic" },
  { slug: "garamond", label: "Garamond" },
  { slug: "georgia", label: "Georgia" },
  { slug: "impact", label: "Impact" },
  { slug: "lucida-console", label: "Lucida Console" },
  { slug: "lucida-sans", label: "Lucida Sans" },
  { slug: "montserrat", label: "Montserrat" },
  { slug: "palatino", label: "Palatino" },
  { slug: "segoe-ui", label: "Segoe UI" },
  { slug: "tahoma", label: "Tahoma" },
  { slug: "times-new-roman", label: "Times New Roman" },
  { slug: "trebuchet-ms", label: "Trebuchet MS" },
  { slug: "verdana", label: "Verdana" },
];

FONT_ENTRIES.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

/** Default font class when composing. */
export const GMAIL_DEFAULT_FONT = "montserrat";

/**
 * Quill font picker values (no `false` — all fonts are explicit classes).
 */
export const GMAIL_QUILL_FONT_OPTIONS: string[] = FONT_ENTRIES.map((f) => f.slug);

export const GMAIL_QUILL_FONT_WHITELIST: string[] = [...GMAIL_QUILL_FONT_OPTIONS];
