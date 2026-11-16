import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export { getIntegration, getSecret, saveIntegration } from "./integrations"

export interface KeyringKey {
  version: number
  key: Buffer
}
export interface Keyring {
  current: KeyringKey
  previous?: KeyringKey
}

/** Messages are constant strings: never put a key, a plaintext or a ciphertext in one. */
export class SecretsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SecretsError"
  }
}

const FORMAT = "v1"

/** `<version>:<base64 of 32 bytes>`, null when it does not parse. */
export function parseKeyEntry(raw: string): KeyringKey | null {
  const match = /^([1-9]\d{0,8}):([A-Za-z0-9+/]{43}=)$/.exec(raw.trim())
  if (!match) return null
  const key = Buffer.from(match[2] as string, "base64")
  return key.length === 32 ? { version: Number(match[1]), key } : null
}

export function parseKeyring(current?: string, previous?: string): Keyring | null {
  if (!current) return null
  const cur = parseKeyEntry(current)
  if (!cur) throw new SecretsError('SECRETS_KEY must be "<version>:<base64 32 bytes>"')
  const prev = previous ? parseKeyEntry(previous) : null
  if (previous && !prev) throw new SecretsError('SECRETS_KEY_PREVIOUS must be "<version>:<base64 32 bytes>"')
  return prev ? { current: cur, previous: prev } : { current: cur }
}

const b64 = (buf: Buffer) => buf.toString("base64url")

export function encryptJson(
  keyring: Keyring,
  value: Record<string, string>,
  aad: string,
): { secretsEnc: string; keyVersion: number } {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyring.current.key, iv)
  cipher.setAAD(Buffer.from(aad))
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return {
    secretsEnc: `${FORMAT}.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(data)}`,
    keyVersion: keyring.current.version,
  }
}

export function decryptJson(
  keyring: Keyring,
  secretsEnc: string,
  keyVersion: number,
  aad: string,
): Record<string, string> {
  const fail = () => new SecretsError("cannot decrypt")
  const entry = [keyring.current, keyring.previous].find((k) => k?.version === keyVersion)
  const [format, iv, tag, data] = secretsEnc.split(".")
  if (!entry || format !== FORMAT || !iv || !tag || data === undefined) throw fail()
  try {
    const decipher = createDecipheriv("aes-256-gcm", entry.key, Buffer.from(iv, "base64url"))
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()])
    return JSON.parse(plain.toString("utf8")) as Record<string, string>
  } catch {
    throw fail()
  }
}

export const integrationAad = (provider: string) => `integration:${provider}`
