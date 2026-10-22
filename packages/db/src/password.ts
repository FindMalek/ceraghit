import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const KEY_LENGTH = 64

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

/** `scrypt$<salt>$<hash>`, node:crypto only so it runs the same on Bun, Node and Vercel. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString("base64url")}$${(await derive(password, salt)).toString("base64url")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$")
  if (scheme !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64url")
  const actual = await derive(password, Buffer.from(salt, "base64url"))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
