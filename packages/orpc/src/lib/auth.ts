import { adminSessions, admins, type Db } from "@workspace/db"
import { verifyPassword } from "@workspace/db/password"
import { and, eq, gt } from "drizzle-orm"

export const ADMIN_COOKIE = "ceraghit_admin"
const SESSION_DAYS = 14
const LOCK_AFTER = 8
const LOCK_MS = 15 * 60_000

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Buffer.from(digest).toString("hex")
}

export class AdminAuth {
  private failures = new Map<string, number[]>()

  constructor(private db: Db) {}

  private recent(address: string): number[] {
    const now = Date.now()
    const recent = (this.failures.get(address) ?? []).filter((at) => now - at < LOCK_MS)
    if (recent.length) this.failures.set(address, recent)
    else this.failures.delete(address)
    return recent
  }

  locked(address: string): boolean {
    return this.recent(address).length >= LOCK_AFTER
  }

  /** Counts the attempt before the slow hash check so parallel guesses can't slip past the lock. */
  async login(address: string, email: string, password: string): Promise<{ token: string; expires: Date } | null> {
    if (this.locked(address)) return null
    if (this.failures.size > 10_000) this.failures.clear()
    const attempt = Date.now()
    this.failures.set(address, [...this.recent(address), attempt])
    const admin = await this.db.query.admins.findFirst({ where: eq(admins.email, email.toLowerCase()) })
    const ok = admin ? await verifyPassword(password, admin.passwordHash).catch(() => false) : false
    if (!admin || !ok) return null
    this.failures.set(
      address,
      this.recent(address).filter((at) => at !== attempt),
    )
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
    await this.db
      .insert(adminSessions)
      .values({ tokenHash: await sha256(token), adminId: admin.id, expiresAt: expires })
    return { token, expires }
  }

  async admin(token: string | undefined): Promise<{ id: string; email: string; name: string } | null> {
    if (!token) return null
    const row = await this.db
      .select({ id: admins.id, email: admins.email, name: admins.name })
      .from(adminSessions)
      .innerJoin(admins, eq(admins.id, adminSessions.adminId))
      .where(and(eq(adminSessions.tokenHash, await sha256(token)), gt(adminSessions.expiresAt, new Date())))
      .limit(1)
    return row[0] ?? null
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, await sha256(token)))
  }
}
