import { describe, expect, test } from "bun:test"
import { decryptJson, encryptJson, type Keyring, parseKeyring, SecretsError } from "../src/lib/secrets"

const K1 = `1:${Buffer.alloc(32, 1).toString("base64")}`
const K2 = `2:${Buffer.alloc(32, 2).toString("base64")}`
const ring = (current: string, previous?: string) => parseKeyring(current, previous) as Keyring
const SENTINEL = "SENTINEL-9f8e7d6c5b4a"
const AAD = "integration:aramex"

describe("vault crypto", () => {
  test("round trip returns the same object and each write uses a fresh iv", () => {
    const a = encryptJson(ring(K1), { apiKey: SENTINEL }, AAD)
    const b = encryptJson(ring(K1), { apiKey: SENTINEL }, AAD)
    expect(a.secretsEnc).not.toBe(b.secretsEnc)
    expect(a.secretsEnc).not.toContain(SENTINEL)
    expect(decryptJson(ring(K1), a.secretsEnc, a.keyVersion, AAD)).toEqual({ apiKey: SENTINEL })
  })

  test("tampered ciphertext or tag fails without leaking anything", () => {
    const { secretsEnc, keyVersion } = encryptJson(ring(K1), { apiKey: SENTINEL }, AAD)
    const [v, iv, tag, data] = secretsEnc.split(".") as [string, string, string, string]
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1)
    for (const bad of [`${v}.${iv}.${tag}.${flip(data)}`, `${v}.${iv}.${flip(tag)}.${data}`]) {
      let message = ""
      try {
        decryptJson(ring(K1), bad, keyVersion, AAD)
      } catch (error) {
        expect(error).toBeInstanceOf(SecretsError)
        message = (error as Error).message
      }
      expect(message).toBe("cannot decrypt")
    }
  })

  test("wrong key and wrong provider fail", () => {
    const { secretsEnc, keyVersion } = encryptJson(ring(K1), { apiKey: SENTINEL }, AAD)
    const otherKey = `1:${Buffer.alloc(32, 9).toString("base64")}`
    expect(() => decryptJson(ring(otherKey), secretsEnc, keyVersion, AAD)).toThrow(SecretsError)
    expect(() => decryptJson(ring(K1), secretsEnc, keyVersion, "integration:groq")).toThrow(SecretsError)
    expect(() => decryptJson(ring(K2), secretsEnc, keyVersion, AAD)).toThrow(SecretsError)
  })

  test("the previous key still decrypts after the current one moved on", () => {
    const old = encryptJson(ring(K1), { apiKey: SENTINEL }, AAD)
    expect(decryptJson(ring(K2, K1), old.secretsEnc, old.keyVersion, AAD)).toEqual({ apiKey: SENTINEL })
  })

  test("a malformed key is refused and never echoed", () => {
    let message = ""
    try {
      parseKeyring("1:not-a-key-SENTINEL")
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain("SECRETS_KEY")
    expect(message).not.toContain("SENTINEL")
  })
})
