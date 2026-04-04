import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

export type GmailApiPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailApiPart[];
};

export function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTextFromPayload(payload: GmailApiPart | null | undefined): {
  text: string;
  html: string | null;
} {
  let plain = "";
  let html: string | null = null;

  function walk(p: GmailApiPart | undefined) {
    if (!p) return;
    const mt = (p.mimeType ?? "").toLowerCase();
    if (mt.startsWith("multipart/") && p.parts?.length) {
      for (const c of p.parts) walk(c);
      return;
    }
    if ((mt === "text/plain" || mt === "text/html") && p.body?.data) {
      const raw = decodeBase64Url(p.body.data);
      if (mt === "text/plain" && raw && (!plain || raw.length > plain.length)) plain = raw;
      if (mt === "text/html" && raw && (!html || raw.length > html.length)) html = raw;
    }
  }

  walk(payload ?? undefined);

  if (!plain && !html && payload?.body?.data) {
    const mt = (payload.mimeType ?? "").toLowerCase();
    const raw = decodeBase64Url(payload.body.data);
    if (mt === "text/plain") plain = raw;
    else if (mt === "text/html") {
      html = raw;
      plain = stripHtml(raw);
    }
  }

  if (!plain && html) plain = stripHtml(html);
  return { text: plain, html };
}

export type GmailHeader = { name?: string; value?: string };

export function headerMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    const n = h.name?.toLowerCase();
    if (n && h.value) m[n] = h.value;
  }
  return m;
}

/** Pulls bare email from a From / Sender style header. */
export function parseEmailFromFromHeader(from: string): string {
  const m = from.match(/<([^>]+@[^>]+)>/);
  if (m) return m[1].trim();
  const t = from.trim();
  const at = t.indexOf("@");
  if (at === -1) return t;
  return t;
}

export function replySubject(subject: string): string {
  const t = subject.trim();
  if (/^re:\s*/i.test(t)) return t;
  return `Re: ${t}`;
}

export function forwardSubject(subject: string): string {
  const t = subject.trim();
  if (/^fwd:\s*/i.test(t)) return t;
  return `Fwd: ${t}`;
}

/** RFC 2047 for non-ASCII header values. */
export function encodeSubjectUtf8(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Build a minimal text/plain MIME message (UTF-8 body via base64 CTE). */
export function buildTextPlainMime(opts: {
  to: string;
  subject: string;
  body: string;
  extraHeaders: Record<string, string>;
}): string {
  const subj = encodeSubjectUtf8(opts.subject);
  const b64 = Buffer.from(opts.body, "utf8").toString("base64");
  const wrapped = b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
  const extra = Object.entries(opts.extraHeaders)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`);
  return [
    `To: ${opts.to}`,
    `Subject: ${subj}`,
    ...extra,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapped,
  ].join("\r\n");
}

export function toGmailRaw(mime: string): string {
  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type GmailPartExt = GmailApiPart & {
  filename?: string;
  headers?: GmailHeader[];
  parts?: GmailPartExt[];
  body?: { attachmentId?: string; data?: string; size?: number };
};

/** Map Content-ID fragments → Gmail attachmentId for inline images. */
export function collectCidAttachmentMap(part: GmailPartExt | undefined, out: Map<string, string>): void {
  if (!part) return;
  const hm = headerMap(part.headers);
  const cidRaw = (hm["content-id"] || "").trim();
  const attId = part.body?.attachmentId;
  if (cidRaw && attId) {
    const inner = cidRaw.replace(/^<|>$/g, "");
    const short = inner.split("@")[0] ?? inner;
    out.set(inner.toLowerCase(), attId);
    out.set(short.toLowerCase(), attId);
  }
  if (part.parts) {
    for (const c of part.parts) collectCidAttachmentMap(c as GmailPartExt, out);
  }
}

/** Replace `cid:...` in HTML with authenticated attachment URLs. */
export function rewriteHtmlCidSources(
  html: string,
  baseOrigin: string,
  messageId: string,
  accountId: string,
  cidMap: Map<string, string>,
): string {
  return html.replace(/src\s*=\s*["']cid:([^"']+)["']/gi, (_full, ref: string) => {
    const clean = ref.trim().replace(/^<|>$/g, "");
    const short = clean.split("@")[0]?.toLowerCase() ?? "";
    const att =
      cidMap.get(clean.toLowerCase()) ||
      cidMap.get(short) ||
      cidMap.get(ref.toLowerCase());
    if (!att) return `src="cid:${ref}"`;
    const u = new URL("/api/integrations/google/gmail/attachment", baseOrigin.endsWith("/") ? baseOrigin : `${baseOrigin}/`);
    u.searchParams.set("messageId", messageId);
    u.searchParams.set("accountId", accountId);
    u.searchParams.set("attachmentId", att);
    return `src="${u.href}"`;
  });
}

export function normalizeEmail(s: string): string {
  const m = s.match(/<([^>]+@[^>]+)>/);
  const raw = (m ? m[1] : s).trim();
  return raw.toLowerCase();
}

/** Extract bare email addresses from a To/Cc header value. */
export function parseEmailAddresses(header: string): string[] {
  if (!header.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<([^>\s]+@[^>\s]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    const addr = (m[1] || m[2]).trim();
    const low = addr.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      out.push(addr);
    }
  }
  return out;
}

/** Recipients for Reply-All: primary in To, others in Cc (excludes mailbox owner). */
export function computeReplyAllRecipients(
  headers: Record<string, string>,
  mailboxEmail: string,
): { to: string; cc: string } {
  const fromH = headers["from"] ?? "";
  const replyToH = headers["reply-to"] ?? "";
  const toH = headers["to"] ?? "";
  const ccH = headers["cc"] ?? "";
  const primary = parseEmailFromFromHeader(replyToH || fromH);
  const my = normalizeEmail(mailboxEmail);
  const toList = parseEmailAddresses(toH);
  const ccList = parseEmailAddresses(ccH);
  const fromList = parseEmailAddresses(fromH);
  const union = [...new Set([...toList, ...ccList, ...fromList].map((e) => normalizeEmail(e)))];
  const others = union.filter((e) => e !== my && e !== normalizeEmail(primary));
  return {
    to: primary,
    cc: others.join(", "),
  };
}

function wrapB64(b64: string): string {
  const clean = b64.replace(/\r?\n/g, "");
  return clean.match(/.{1,76}/g)?.join("\r\n") ?? clean;
}

export type OutgoingAttachment = {
  filename: string;
  contentType: string;
  /** Standard base64 (not base64url). */
  dataBase64: string;
};

/** Full RFC 2822 message: multipart/alternative, or multipart/mixed wrapping alternative + attachments. */
export function buildEmailMime(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  textPlain: string;
  html: string;
  extraHeaders: Record<string, string>;
  attachments: OutgoingAttachment[];
}): string {
  const altB = `bacup_alt_${randomBytes(10).toString("hex")}`;
  const plainB64 = wrapB64(Buffer.from(opts.textPlain, "utf8").toString("base64"));
  const htmlB64 = wrapB64(Buffer.from(opts.html, "utf8").toString("base64"));
  const altInner = [
    `--${altB}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plainB64,
    `--${altB}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    `--${altB}--`,
  ].join("\r\n");

  const subj = encodeSubjectUtf8(opts.subject);
  const extra = Object.entries(opts.extraHeaders)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`);

  const head = [
    `To: ${opts.to}`,
    ...(opts.cc?.trim() ? [`Cc: ${opts.cc.trim()}`] : []),
    ...(opts.bcc?.trim() ? [`Bcc: ${opts.bcc.trim()}`] : []),
    `Subject: ${subj}`,
    ...extra,
  ];

  if (opts.attachments.length === 0) {
    return [
      ...head,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${altB}"`,
      "",
      altInner,
    ].join("\r\n");
  }

  const mixB = `bacup_mix_${randomBytes(10).toString("hex")}`;
  const mixedParts: string[] = [
    ...head,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixB}"`,
    "",
    `--${mixB}`,
    `Content-Type: multipart/alternative; boundary="${altB}"`,
    "",
    altInner,
  ];

  for (const a of opts.attachments) {
    let raw: Buffer;
    try {
      raw = Buffer.from(a.dataBase64, "base64");
    } catch {
      continue;
    }
    if (raw.length === 0) continue;
    const b64 = wrapB64(raw.toString("base64"));
    const safeName = a.filename.replace(/[\r\n"]/g, "_");
    mixedParts.push(
      `--${mixB}`,
      `Content-Type: ${a.contentType || "application/octet-stream"}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64,
    );
  }
  mixedParts.push(`--${mixB}--`);
  return mixedParts.join("\r\n");
}

export function htmlToPlainFallback(html: string): string {
  return stripHtml(html);
}
