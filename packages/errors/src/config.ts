type Source = Record<string, string | undefined>

export interface GlitchtipConfig {
  dsn: string
  environment: "preview" | "production"
  release: string | undefined
  sampleRate: number
}

export interface GlitchtipNames {
  dsn: string
  env: string
  release: string
}

/** Server and api read these. The browser reads the `NEXT_PUBLIC_` twins, inlined at build time. */
export const SERVER_NAMES: GlitchtipNames = { dsn: "GLITCHTIP_DSN", env: "GLITCHTIP_ENV", release: "GLITCHTIP_RELEASE" }
export const CLIENT_NAMES: GlitchtipNames = {
  dsn: "NEXT_PUBLIC_GLITCHTIP_DSN",
  env: "NEXT_PUBLIC_GLITCHTIP_ENV",
  release: "NEXT_PUBLIC_GLITCHTIP_RELEASE",
}

function validDsn(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !!url.username &&
      /^\d+$/.test(url.pathname.split("/").filter(Boolean).pop() ?? "")
    )
  } catch {
    return false
  }
}

/**
 * Why a GlitchTip setup is refused at boot. A DSN belongs to one project per environment, so it carries a declared
 * `GLITCHTIP_ENV` that must equal `APP_ENV`: a production DSN can never be set on a preview, an e2e stack or a laptop.
 * `APP_ENV=local` stays legal (the SDK just never starts), so a shared `.env` cannot send demo noise.
 */
export function glitchtipIssues(env: Source, names: GlitchtipNames = SERVER_NAMES): string[] {
  const issues: string[] = []
  const dsn = env[names.dsn]
  const declared = env[names.env]
  const appEnv = env.APP_ENV ?? "local"
  if (declared && declared !== "preview" && declared !== "production")
    issues.push(`${names.env} must be preview or production`)
  if (declared === "production" && appEnv !== "production") {
    issues.push(`${names.env}=production is only allowed with APP_ENV=production`)
  }
  if (!dsn) return issues
  if (!validDsn(dsn)) issues.push(`${names.dsn} must look like https://<key>@<host>/<project id>`)
  if (appEnv !== "local" && declared !== appEnv)
    issues.push(`${names.dsn} needs ${names.env}=${appEnv} (one project per environment)`)
  return issues
}

/** The config to start the SDK with, or null: no DSN, `APP_ENV=local`, or a setup `glitchtipIssues` refuses. */
export function resolveGlitchtip(env: Source, names: GlitchtipNames = SERVER_NAMES): GlitchtipConfig | null {
  const dsn = env[names.dsn]
  const appEnv = env.APP_ENV ?? "local"
  if (!dsn || appEnv === "local" || glitchtipIssues(env, names).length) return null
  const rate = Number(env.GLITCHTIP_SAMPLE_RATE)
  return {
    dsn,
    environment: appEnv === "production" ? "production" : "preview",
    release: env[names.release] || env.VERCEL_GIT_COMMIT_SHA || env.GIT_SHA || env.GITHUB_SHA || undefined,
    sampleRate: env.GLITCHTIP_SAMPLE_RATE && rate >= 0 && rate <= 1 ? rate : 1,
  }
}

/** Origin the browser posts events to, for the CSP `connect-src`. Null without a usable DSN. */
export function glitchtipOrigin(dsn: string | undefined): string | null {
  if (!dsn || !validDsn(dsn)) return null
  return new URL(dsn).origin
}
