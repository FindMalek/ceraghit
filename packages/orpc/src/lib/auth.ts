import { adminSessions, admins, type Db, settings } from "@workspace/db"
import { hashPassword, verifyPassword } from "@workspace/db/password"
import { and, eq, gt, ne } from "drizzle-orm"
import { isLimited, LIMITS, resetLimit, takeLimit } from "./rate-limit"

export const ADMIN_COOKIE = "ceraghit_admin"
const SESSION_DAYS = 14

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Buffer.from(digest).toString("hex")
}

const ipKey = (address: string) => `login:ip:${address}`
const emailKey = async (email: string) => `login:email:${await sha256(email.trim().toLowerCase())}`

export class AdminAuth {
  constructor(
    private db: Db,
    private now: () => Date = () => new Date(),
  ) {}

  /** What locked this login: the email (1 hour) or the address (15 minutes), null when neither used up its attempts. */
  async locked(address: string, email: string): Promise<"email" | "ip" | null> {
    const now = this.now()
    if (await isLimited(this.db, await emailKey(email), LIMITS.loginEmail, now)) return "email"
    if (await isLimited(this.db, ipKey(address), LIMITS.loginIp, now)) return "ip"
    return null
  }

  /** Counts the attempt before the slow hash check so parallel guesses can't slip past the lock. A success clears it. */
  async login(address: string, email: string, password: string): Promise<{ token: string; expires: Date } | null> {
    const keys = [ipKey(address), await emailKey(email)]
    const [ipOk, emailOk] = await Promise.all([
      takeLimit(this.db, keys[0]!, LIMITS.loginIp, this.now()),
      takeLimit(this.db, keys[1]!, LIMITS.loginEmail, this.now()),
    ])
    if (!ipOk || !emailOk) return null
    const admin = await this.db.query.admins.findFirst({ where: eq(admins.email, email.toLowerCase()) })
    const ok = admin ? await verifyPassword(password, admin.passwordHash).catch(() => false) : false
    if (!admin || !ok) return null
    await Promise.all(keys.map((key) => resetLimit(this.db, key)))
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
    await this.db
      .insert(adminSessions)
      .values({ tokenHash: await sha256(token), adminId: admin.id, expiresAt: expires })
    return { token, expires }
  }

  async admin(
    token: string | undefined,
  ): Promise<{ id: string; email: string; name: string; nameConfirmedAt: Date | null } | null> {
    if (!token) return null
    const row = await this.db
      .select({ id: admins.id, email: admins.email, name: admins.name, nameConfirmedAt: admins.nameConfirmedAt })
      .from(adminSessions)
      .innerJoin(admins, eq(admins.id, adminSessions.adminId))
      .where(and(eq(adminSessions.tokenHash, await sha256(token)), gt(adminSessions.expiresAt, new Date())))
      .limit(1)
    return row[0] ?? null
  }

  /**
   * Checks the current password (counted before the slow hash, like login), stores the new one, signs every other
   * session out and keeps the one that asked. Leaves a settings row `admin-audit:...` as the trail, never a password.
   */
  async changePassword(
    admin: { id: string },
    token: string | undefined,
    address: string,
    current: string,
    next: string,
  ): Promise<"ok" | "limited" | "wrong"> {
    const key = `password:admin:${admin.id}`
    if (!(await takeLimit(this.db, key, LIMITS.passwordChange, this.now()))) return "limited"
    const row = await this.db.query.admins.findFirst({ where: eq(admins.id, admin.id) })
    if (!row || !(await verifyPassword(current, row.passwordHash).catch(() => false))) return "wrong"
    const passwordHash = await hashPassword(next)
    const keep = token ? await sha256(token) : ""
    const now = this.now()
    await this.db.transaction(async (tx) => {
      await tx.update(admins).set({ passwordHash }).where(eq(admins.id, admin.id))
      await tx.delete(adminSessions).where(and(eq(adminSessions.adminId, admin.id), ne(adminSessions.tokenHash, keep)))
      await tx.insert(settings).values({
        key: `admin-audit:${admin.id}:${now.toISOString()}`,
        value: { action: "password_changed", adminId: admin.id, at: now.toISOString(), address },
      })
    })
    await resetLimit(this.db, key)
    return "ok"
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, await sha256(token)))
  }
}
