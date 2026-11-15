import { adminSessions, admins, type Db } from "@workspace/db"
import { verifyPassword } from "@workspace/db/password"
import { and, eq, gt } from "drizzle-orm"
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

  /** True once this address or this email used up its failed attempts. */
  async locked(address: string, email: string): Promise<boolean> {
    const now = this.now()
    return (
      (await isLimited(this.db, ipKey(address), LIMITS.loginIp, now)) ||
      (await isLimited(this.db, await emailKey(email), LIMITS.loginEmail, now))
    )
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

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, await sha256(token)))
  }
}
