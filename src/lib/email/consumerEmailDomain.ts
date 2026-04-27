/**
 * Domains treated as personal / consumer mail.
 * Work (custom) domains get AI inbox digest on Overview; these do not.
 */
const CONSUMER_DOMAINS = new Set(
  [
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "yahoo.com",
    "ymail.com",
    "rocketmail.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "gmx.com",
    "gmx.de",
    "gmx.net",
    "mail.com",
    "yandex.com",
    "yandex.ru",
    "hey.com",
    "fastmail.com",
    "fastmail.fm",
    "tutanota.com",
    "tuta.io",
    "duck.com",
    "qq.com",
    "163.com",
    "126.com",
    "pm.me",
    "zohomail.in",
  ].map((d) => d.toLowerCase()),
);

export function mailboxHostLower(email: string): string | null {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0 || at === e.length - 1) return null;
  return e.slice(at + 1).trim() || null;
}

export function isConsumerEmailDomain(email: string): boolean {
  const host = mailboxHostLower(email);
  if (!host) return true;
  return CONSUMER_DOMAINS.has(host);
}
