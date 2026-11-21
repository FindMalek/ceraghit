const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

export interface GuardEnv {
  APP_ENV?: string
  DATABASE_URL?: string
  MAIL_REDIRECT_TO?: string
  API_URL?: string
  WEB_URL?: string
  DASHBOARD_URL?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
}

const URL_VARS = ["WEB_URL", "DASHBOARD_URL", "API_URL"] as const

/** A loopback hostname only: parsed, so `localhost@evil.com` and `localhost.evil.com` do not pass. */
function urlProblem(name: string, value: string | undefined): string | null {
  if (!value) return null
  let host: string
  try {
    host = new URL(value).hostname
  } catch {
    return `${name} is not a URL`
  }
  if (LOCAL_HOSTS.has(host)) return null
  return `${name} host must be localhost or 127.0.0.1 so the recorder never drives a real site, got "${host}"`
}

/** A logged in video needs the demo admin; refuse instead of typing an empty form. */
export function assertAdminCredentials(env: GuardEnv): void {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to record a logged in video")
  }
}

/** Problems with the environment itself, before any request. Empty means safe so far. */
export function envProblems(env: GuardEnv): string[] {
  const problems: string[] = []
  if (env.APP_ENV !== "local") problems.push(`APP_ENV must be "local", got "${env.APP_ENV ?? ""}"`)
  let host = ""
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname
  } catch {
    problems.push("DATABASE_URL is missing or not a URL")
  }
  if (host && !LOCAL_HOSTS.has(host)) problems.push(`DATABASE_URL host must be localhost, got "${host}"`)
  for (const name of URL_VARS) {
    const problem = urlProblem(name, env[name])
    if (problem) problems.push(problem)
  }
  if (!env.MAIL_REDIRECT_TO) problems.push("MAIL_REDIRECT_TO must be set so no mail reaches a real customer")
  return problems
}

/** Also asks the api: the payment gateway must be the demo one. */
export async function assertSafe(env: GuardEnv, fetchFn: typeof fetch = fetch): Promise<void> {
  const problems = envProblems(env)
  if (problems.length === 0) {
    const api = env.API_URL ?? "http://localhost:3001"
    try {
      const health = (await (await fetchFn(`${api}/health`)).json()) as { payments?: string }
      if (!health.payments?.startsWith("demo:"))
        problems.push(`payments are "${health.payments}", not the demo gateway`)
    } catch {
      problems.push(`the api at ${api} does not answer: start it with pnpm dev`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`demo videos refuse to run, they only record demo data:\n- ${problems.join("\n- ")}`)
  }
}
