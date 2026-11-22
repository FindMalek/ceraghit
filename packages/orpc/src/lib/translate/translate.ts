import { ORPCError } from "@orpc/server"
import { aiUsage } from "@workspace/db"
import {
  AI_FIELD_LIMITS,
  type AiStatus,
  type AiTranslateField,
  type AiTranslateInput,
  type AiTranslateOutput,
  type AiUsage,
} from "@workspace/sdk"
import { eq, sql } from "drizzle-orm"
import type { Services } from "../../context"
import { getSecret } from "../integrations"
import { recordAiRequest, recordAiTokens } from "../metrics"
import { getAiSettings } from "../settings"
import { groqTranslate, type TranslateFn } from "./eval"
import { AI_MODELS, type AiModelId, costUsd, DEFAULT_AI_MODEL, FALLBACK_AI_MODEL } from "./models"
import { buildTranslatePrompt, type Lang, type TranslateRequest, translationSchema } from "./prompt"
import { lengthRatio, scoreArabicScript } from "./score"

const LANGS: Lang[] = ["fr", "en", "ar"]

/** Studio month in Africa/Tunis, e.g. "2026-11". */
export function studioMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? "1970"
  const month = parts.find((p) => p.type === "month")?.value ?? "01"
  return `${year}-${month}`
}

/**
 * Opens the new studio month: the quota counts the row of the current month, so a zero row is created for it and the
 * month that just closed is reported (its row stays as history). Idempotent: the row is created once, and running it
 * mid-month leaves the counts already there.
 */
export async function rolloverAiUsage(
  services: Pick<Services, "db">,
  now: Date,
): Promise<{ month: string; opened: number; closedRequests: number }> {
  const month = studioMonth(now)
  const [year, number] = month.split("-").map(Number) as [number, number]
  const previous = number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`
  const created = await services.db
    .insert(aiUsage)
    .values({ month, updatedAt: now })
    .onConflictDoNothing()
    .returning({ month: aiUsage.month })
  const closed = await readUsage(services.db, previous)
  return { month, opened: created.length, closedRequests: closed.requests }
}

async function readUsage(db: Services["db"], month: string): Promise<AiUsage> {
  const [row] = await db.select().from(aiUsage).where(eq(aiUsage.month, month)).limit(1)
  return {
    month,
    requests: row?.requests ?? 0,
    tokensIn: row?.tokensIn ?? 0,
    tokensOut: row?.tokensOut ?? 0,
    costUsd: (row?.costMicroUsd ?? 0) / 1_000_000,
  }
}

async function recordUsage(
  db: Services["db"],
  month: string,
  tokensIn: number,
  tokensOut: number,
  costMicroUsd: number,
): Promise<void> {
  await db
    .insert(aiUsage)
    .values({ month, requests: 1, tokensIn, tokensOut, costMicroUsd, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: aiUsage.month,
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        tokensIn: sql`${aiUsage.tokensIn} + ${tokensIn}`,
        tokensOut: sql`${aiUsage.tokensOut} + ${tokensOut}`,
        costMicroUsd: sql`${aiUsage.costMicroUsd} + ${costMicroUsd}`,
        updatedAt: new Date(),
      },
    })
}

export async function getAiStatus(services: Services): Promise<AiStatus> {
  const settings = await getAiSettings(services.db)
  const secret = await getSecret(services, "groq")
  const month = studioMonth(services.now())
  const usage = await readUsage(services.db, month)
  return {
    configured: Boolean(secret?.apiKey),
    model: settings.model,
    month,
    usage,
    capUsd: settings.monthlyCapUsd,
    capReached: settings.monthlyCapUsd !== null && usage.costUsd >= settings.monthlyCapUsd,
  }
}

function sourceLanguage(values: AiTranslateInput["values"]): Lang {
  if (values.fr.trim()) return "fr"
  const filled = LANGS.find((lang) => values[lang].trim())
  if (!filled) throw new ORPCError("BAD_REQUEST", { message: "Écrivez d'abord le texte en français." })
  return filled
}

function targetLanguages(values: AiTranslateInput["values"]): Lang[] {
  return LANGS.filter((lang) => !values[lang].trim())
}

function tooLong(request: TranslateRequest, values: Partial<Record<Lang, string>>): boolean {
  return Object.values(values).some((text) => text !== undefined && text.length > request.maxLength)
}

function lengthWarning(source: string, target: string): boolean {
  const ratio = lengthRatio(source, target)
  return ratio !== null && Math.abs(ratio - 1) > 0.25
}

export interface TranslateDeps {
  translate?: TranslateFn
}

/**
 * Drafts the empty languages of one localized field. Nothing is written: the caller returns the drafts to the form.
 * Usage is recorded whatever the outcome of the post-checks, and the monthly cap is enforced before any call.
 */
export async function translateField(
  services: Services,
  input: AiTranslateInput,
  deps: TranslateDeps = {},
): Promise<AiTranslateOutput> {
  const settings = await getAiSettings(services.db)
  const secret = await getSecret(services, "groq")
  const apiKey = typeof secret?.apiKey === "string" ? secret.apiKey : null
  if (!apiKey) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Ajoutez une clé Groq dans les réglages pour traduire." })
  }

  const targets = targetLanguages(input.values)
  if (targets.length === 0) throw new ORPCError("BAD_REQUEST", { message: "Toutes les langues sont déjà remplies." })
  const source = sourceLanguage(input.values)
  const maxLength = AI_FIELD_LIMITS[input.field as AiTranslateField]
  const month = studioMonth(services.now())
  const usage = await readUsage(services.db, month)
  const cap = settings.monthlyCapUsd
  if (cap !== null && usage.costUsd >= cap) {
    throw new ORPCError("FORBIDDEN", {
      message: `Limite mensuelle de traduction atteinte (${usage.costUsd.toFixed(2)} $ sur ${cap} $). Augmentez-la dans les réglages ou attendez le 1er du mois.`,
    })
  }

  const translate = deps.translate ?? groqTranslate(apiKey, services.config.groqBaseUrl)
  const request: TranslateRequest = {
    field: input.field,
    maxLength,
    source: { lang: source, text: input.values[source] },
    targets,
  }
  let model: AiModelId = settings.model in AI_MODELS ? (settings.model as AiModelId) : DEFAULT_AI_MODEL
  let result = await translate({ model, effort: settings.reasoningEffort }, request)

  if (result.output === null) {
    model = FALLBACK_AI_MODEL
    result = await translate({ model, effort: settings.reasoningEffort }, request)
    if (result.output === null) {
      recordAiRequest({ model, result: "error" })
      throw new ORPCError("BAD_GATEWAY", { message: "Le service de traduction ne répond pas. Réessayez." })
    }
  }

  let tokensIn = result.inputTokens
  let tokensOut = result.outputTokens
  let values: Partial<Record<Lang, string>> = result.output ?? {}

  if (tooLong(request, values)) {
    const feedback = `Too long. Maximum ${maxLength} characters. Keep the same meaning and shorten.`
    const retry = await translate({ model, effort: settings.reasoningEffort }, { ...request, feedback })
    tokensIn += retry.inputTokens
    tokensOut += retry.outputTokens
    if (retry.output) values = retry.output
  }

  const warnings: AiTranslateOutput["warnings"] = []
  const sourceText = input.values[source]
  for (const lang of targets) {
    const text = values[lang]
    if (text === undefined) continue
    if (lengthWarning(sourceText, text)) warnings.push("length")
    if (lang === "ar" && !scoreArabicScript(text).valid) warnings.push("arabic_script")
  }

  await recordUsage(
    services.db,
    month,
    tokensIn,
    tokensOut,
    Math.round(costUsd(model, tokensIn, tokensOut) * 1_000_000),
  )
  recordAiRequest({ model, result: warnings.length ? "length" : "ok" })
  recordAiTokens({ model }, tokensIn + tokensOut)

  return {
    values: Object.fromEntries(targets.map((lang) => [lang, values[lang] ?? ""])),
    warnings: [...new Set(warnings)],
    usage: { tokensIn, tokensOut },
  }
}

/** Strict schema used by the eval and the tests; exported so callers build the same answer shape. */
export { translationSchema }
