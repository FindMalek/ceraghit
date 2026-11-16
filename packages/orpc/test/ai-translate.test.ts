import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { aiUsage, createDb, integrationCredentials } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { saveAiSettings } from "../src/lib/settings"
import type { TranslateFn } from "../src/lib/translate/eval"
import { FALLBACK_AI_MODEL } from "../src/lib/translate/models"
import { studioMonth, translateField } from "../src/lib/translate/translate"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })

function baseServices(db: Services["db"], over: Partial<Services> = {}): Services {
  return {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2026-11-16T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
      envCredentials: { groq: { apiKey: "gsk_test" } },
    },
    ...over,
  }
}

/** Answers each target with a fixed string, counts calls. */
function fakeTranslate(
  output: (request: { targets: string[]; source: string }) => Record<string, string>,
): TranslateFn {
  return async (_column, request) => ({
    output: output({ targets: request.targets, source: request.source.text }),
    error: null,
    latencyMs: 1,
    inputTokens: 100,
    outputTokens: 50,
  })
}

describe.skipIf(!url)("ai translate", () => {
  const db = createDb(url!)
  let services: Services
  let owner: ReturnType<typeof makeOwner>

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    services = baseServices(db)
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = () =>
      new Headers({
        cookie: `ceraghit_admin=${session!.token}`,
        "x-csrf-token": "orpc",
        "x-forwarded-for": "127.0.0.1",
      })
    owner = makeOwner(() => createContext(services, headers()))
  })

  beforeEach(async () => {
    await db.delete(aiUsage)
    await db.delete(integrationCredentials).where(eq(integrationCredentials.provider, "groq"))
    await saveAiSettings(db, { model: "openai/gpt-oss-120b", reasoningEffort: "low", monthlyCapUsd: 5 })
  })

  afterAll(async () => {
    await db.close()
  })

  const values = { fr: "Vase en grès émaillé", en: "", ar: "" }

  test("fills only the empty languages and keeps the source out of the answer", async () => {
    const result = await translateField(
      services,
      { field: "product.title", values: { ...values, ar: "مزهرية" } },
      { translate: fakeTranslate(() => ({ en: "Glazed stoneware vase" })) },
    )
    expect(result.values).toEqual({ en: "Glazed stoneware vase" })
    expect(result.warnings).toEqual([])
  })

  test("translates French into Arabic and warns when the script looks wrong", async () => {
    const result = await translateField(
      services,
      { field: "product.title", values },
      {
        translate: fakeTranslate(() => ({ en: "Glazed stoneware vase", ar: "مزهرية من الخزف الحجري المزجج" })),
      },
    )
    expect(result.values).toEqual({ en: "Glazed stoneware vase", ar: "مزهرية من الخزف الحجري المزجج" })
    expect(result.warnings).not.toContain("arabic_script")
  })

  test("uses the first filled language when French is empty", async () => {
    const result = await translateField(
      services,
      { field: "variant.label", values: { fr: "", en: "Large", ar: "" } },
      { translate: fakeTranslate(() => ({ fr: "Grand", ar: "كبير" })) },
    )
    expect(result.values).toEqual({ fr: "Grand", ar: "كبير" })
  })

  test("refuses when every language is filled", async () => {
    await expect(
      translateField(
        services,
        { field: "product.title", values: { fr: "a", en: "b", ar: "c" } },
        {
          translate: fakeTranslate(() => ({})),
        },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("retries once when the answer is too long, then keeps the retry", async () => {
    let calls = 0
    const translate: TranslateFn = async (_column, request) => {
      calls++
      return {
        output: calls === 1 ? { en: "x".repeat(200) } : { en: "x".repeat(100) },
        error: null,
        latencyMs: 1,
        inputTokens: 10,
        outputTokens: 5,
      }
    }
    const result = await translateField(services, { field: "product.title", values }, { translate })
    expect(calls).toBe(2)
    expect(result.values.en?.length).toBe(100)
    expect(result.usage).toEqual({ tokensIn: 20, tokensOut: 10 })
  })

  test("records usage for the month", async () => {
    await translateField(
      services,
      { field: "product.title", values },
      {
        translate: fakeTranslate(() => ({ en: "Glazed stoneware vase", ar: "مزهرية" })),
      },
    )
    const [row] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.month, studioMonth(services.now())))
    expect(row).toMatchObject({ requests: 1, tokensIn: 100, tokensOut: 50 })
  })

  test("refuses past the monthly cap without calling the provider", async () => {
    await saveAiSettings(db, { model: "openai/gpt-oss-120b", reasoningEffort: "low", monthlyCapUsd: 0 })
    let called = false
    await expect(
      translateField(
        services,
        { field: "product.title", values },
        {
          translate: async () => {
            called = true
            throw new Error("should not be called")
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(called).toBe(false)
  })

  test("refuses without a Groq key", async () => {
    const noKey = baseServices(db, { config: { ...baseServices(db).config, envCredentials: {} } })
    await expect(
      translateField(noKey, { field: "product.title", values }, { translate: fakeTranslate(() => ({ en: "x" })) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("falls back to the small model when the first call fails", async () => {
    const models: string[] = []
    const translate: TranslateFn = async (column, request) => {
      models.push(column.model)
      if (column.model === "openai/gpt-oss-120b") {
        return { output: null, error: "RateLimit", latencyMs: 1, inputTokens: 0, outputTokens: 0 }
      }
      return {
        output: { en: "Glazed stoneware vase", ar: "مزهرية" },
        error: null,
        latencyMs: 1,
        inputTokens: 10,
        outputTokens: 5,
      }
    }
    const result = await translateField(services, { field: "product.title", values }, { translate })
    expect(models).toEqual(["openai/gpt-oss-120b", FALLBACK_AI_MODEL])
    expect(result.values.en).toBe("Glazed stoneware vase")
  })

  test("status reports the key, model and current month usage", async () => {
    const status = await owner.ai.status()
    expect(status).toMatchObject({ configured: true, model: "openai/gpt-oss-120b", capUsd: 5, capReached: false })
    expect(status.month).toBe(studioMonth(services.now()))
  })

  test("saving settings round-trips", async () => {
    expect(
      await owner.ai.saveSettings({ model: "openai/gpt-oss-20b", reasoningEffort: "medium", monthlyCapUsd: 10 }),
    ).toEqual({
      ok: true,
    })
    expect(await owner.ai.settings()).toMatchObject({
      model: "openai/gpt-oss-20b",
      reasoningEffort: "medium",
      monthlyCapUsd: 10,
    })
  })
})
