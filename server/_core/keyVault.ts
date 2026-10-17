import * as crypto from "crypto";

// Versioned authenticated encryption for user-supplied secrets — provider API keys
// and webhook signing secrets.
//
// Values are AES-256-GCM under a key derived from JWT_SECRET and prefixed with
// "v2:" so the format is self-describing. Legacy values written before v2 (XOR
// obfuscation, or plaintext) stay readable so existing connections keep working,
// and are re-written in the v2 format the next time they are saved.

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.JWT_SECRET || "genei-secret").digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  if (!isEncryptedSecret(encoded)) {
    // Legacy XOR obfuscation, retained only so previously stored keys remain readable.
    const secret = process.env.JWT_SECRET || "genei-secret";
    const buf = Buffer.from(encoded, "base64");
    const secretBuf = Buffer.from(secret, "utf8");
    const result = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) result[i] = buf[i] ^ secretBuf[i % secretBuf.length];
    return result.toString("utf8");
  }

  const payload = Buffer.from(encoded.slice(3), "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith("v2:");
}
