import { z } from "zod"

const flag = z.enum(["true", "false"]).transform((v) => v === "true")

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    /** The one switch that decides which guards apply: production is strict, everything else must stay in test mode. */
    APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    /** Public origins, used for payment redirects and the webhook. */
    WEB_URL: z.url().default("http://localhost:3000"),
    API_PUBLIC_URL: z.url().default("http://localhost:3001"),
    /** "production", "pr-<n>" or "local", shown in the dashboard and used as the S3 prefix of previews. */
    DEPLOY_ENV: z.string().default("local"),
    /** Migrate and seed on start. On for local and previews, off in production where CI migrates before deploy. */
    BOOTSTRAP: flag.optional(),
    SEED_DEMO: flag.default(true),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    KONNECT_API_KEY: z.string().optional(),
    KONNECT_WALLET_ID: z.string().optional(),
    KONNECT_MODE: z.enum(["test", "live"]).default("test"),
    /** Order emails go through Resend. Without a key they are only logged (local and previews). */
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Ceraghit <onboarding@resend.dev>"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message })
    if (env.APP_ENV === "production") {
      if (env.KONNECT_MODE !== "live") fail("production needs KONNECT_MODE=live")
      if (!env.KONNECT_API_KEY || !env.KONNECT_WALLET_ID) fail("production needs KONNECT_API_KEY and KONNECT_WALLET_ID")
      if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        fail("production needs the R2 S3_* settings")
      }
      if (!env.RESEND_API_KEY) fail("production needs RESEND_API_KEY")
      if (env.SEED_DEMO && env.BOOTSTRAP) fail("production must not seed demo data")
      if (env.DEPLOY_ENV !== "production") fail("production needs DEPLOY_ENV=production")
    } else {
      if (env.KONNECT_MODE === "live") fail("live payment keys are only allowed with APP_ENV=production")
      if (env.DEPLOY_ENV === "production") fail("DEPLOY_ENV=production is only allowed with APP_ENV=production")
    }
  })

export type Env = Omit<z.infer<typeof schema>, "BOOTSTRAP"> & { BOOTSTRAP: boolean }

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")))
  return { ...parsed, BOOTSTRAP: parsed.BOOTSTRAP ?? parsed.APP_ENV !== "production" }
}
