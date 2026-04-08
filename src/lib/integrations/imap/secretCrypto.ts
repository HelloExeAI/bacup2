import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const SALT = "bacup-imap-v1";

export function isImapEncryptionConfigured(): boolean {
  const secret = process.env.BACUP_IMAP_ENCRYPTION_SECRET?.trim();
  return Boolean(secret && secret.length >= 16);
}

function key32(): Buffer {
  const secret = process.env.BACUP_IMAP_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "Set BACUP_IMAP_ENCRYPTION_SECRET in the server environment (min 16 characters) to use IMAP connections.",
    );
  }
  return scryptSync(secret, SALT, 32);
}

/** AES-256-GCM; output is base64url-safe for JSON. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key32(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key32(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
