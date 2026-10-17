import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./_core/keyVault";

// Guards the secret vault. These assert real cryptographic properties rather than
// merely that the functions return a string.

describe("secret vault", () => {
  const plain = JSON.stringify({ webhookUrl: "https://hook.test/x", webhookSecret: "whsec_unit_test_value", enabled: true });

  it("writes a self-describing v2 value", () => {
    const encrypted = encryptSecret(plain);
    expect(encrypted.startsWith("v2:")).toBe(true);
    expect(isEncryptedSecret(encrypted)).toBe(true);
  });

  it("round-trips the exact plaintext", () => {
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("does not leave the secret readable in the stored value", () => {
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toContain("whsec_unit_test_value");
    expect(encrypted).not.toContain("hook.test");
  });

  it("uses a fresh IV per encryption, so identical inputs differ", () => {
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("still reads legacy non-v2 values so existing rows keep working", () => {
    // Legacy XOR obfuscation: base64 of the value XORed with JWT_SECRET.
    const secret = process.env.JWT_SECRET || "genei-secret";
    const secretBuf = Buffer.from(secret, "utf8");
    const raw = Buffer.from(plain, "utf8");
    const legacy = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i += 1) legacy[i] = raw[i] ^ secretBuf[i % secretBuf.length];
    const encoded = legacy.toString("base64");

    expect(isEncryptedSecret(encoded)).toBe(false);
    expect(decryptSecret(encoded)).toBe(plain);
  });
});
