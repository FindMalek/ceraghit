import { admins } from "@workspace/db"
import {
  bankFromProfile,
  type EmailDomain,
  type OptionalSetupStepId,
  SETUP_OPTIONAL_STEPS,
  SETUP_REQUIRED_STEPS,
  type SetupStatus,
  type SetupStep,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { loadEmailDomain } from "./email-domain"
import { emailDomainVerified } from "./resend-domains"
import { getShopProfile, type ShopProfileRow } from "./shop-profile"

export interface SetupInput {
  owner: { name: string; nameConfirmedAt: Date | null }
  profile: ShopProfileRow
  integrations: Record<OptionalSetupStepId, boolean>
}

const PLACEHOLDERS = new Set(["à compléter", "a completer", "[à renseigner]"])

const filled = (value: string | null | undefined): boolean => {
  const text = value?.trim().toLowerCase()
  return !!text && !PLACEHOLDERS.has(text)
}

const PROFILE_FIELDS = [
  "legalName",
  "displayName",
  "address",
  "city",
  "country",
  "email",
  "notifyEmail",
  "taxId",
] as const

export function computeSetup({ owner, profile, integrations }: SetupInput): SetupStatus {
  const skippedIds = new Set(profile.skippedSteps)

  const ownerMissing = !filled(owner.name) || !owner.nameConfirmedAt ? ["name"] : []
  const profileMissing: string[] = PROFILE_FIELDS.filter((key) => !filled(profile[key]))
  if (!filled(profile.phones[0])) profileMissing.push("phones")
  const bankMissing = bankFromProfile(profile) ? [] : ["bank"]
  const shippingMissing = profile.shippingConfirmedAt ? [] : ["shippingConfirmedAt"]

  const requiredMissing = { owner: ownerMissing, profile: profileMissing, bank: bankMissing, shipping: shippingMissing }
  const steps: SetupStep[] = [
    ...SETUP_REQUIRED_STEPS.map((id) => ({
      id,
      required: true,
      done: requiredMissing[id].length === 0,
      skipped: false,
      missing: requiredMissing[id],
    })),
    ...SETUP_OPTIONAL_STEPS.map((id) => ({
      id,
      required: false,
      done: integrations[id],
      skipped: skippedIds.has(id),
      missing: [],
    })),
  ]

  return {
    steps,
    requiredDone: steps.filter((s) => s.required).every((s) => s.done),
    onboarded: !!profile.onboardedAt,
    remaining: steps.filter((s) => (s.required ? !s.done : !s.done && !s.skipped)).length,
    total: steps.length,
    done: steps.filter((s) => s.done).length,
  }
}

const DOMAIN_TTL_MS = 60_000
let domainCache: { at: number; key: string; state: EmailDomain } | null = null

/** Read only (never asks Resend to verify) and cached, so the setup status does not hit Resend on every load. */
async function cachedEmailDomain(ctx: Services): Promise<EmailDomain> {
  const key = `${ctx.config.emailFrom}|${ctx.config.resendApiKey ?? ""}`
  const at = ctx.now().getTime()
  if (domainCache && domainCache.key === key && at - domainCache.at < DOMAIN_TTL_MS) return domainCache.state
  const state = await loadEmailDomain(ctx)
  domainCache = { at, key, state }
  return state
}

/** Each lane that builds an integration replaces its check here. Must not throw; false on any error. */
export const INTEGRATION_CHECKS: Record<OptionalSetupStepId, (ctx: Services) => Promise<boolean>> = {
  konnect: async (ctx) => ctx.payments.name === "konnect", // replaced by the vault check
  aramex: async () => false,
  payoneer: async () => false,
  groq: async () => false,
  emailDomain: async (ctx) => emailDomainVerified((await cachedEmailDomain(ctx)).state),
}

export async function loadSetup(ctx: Services, adminId: string): Promise<SetupStatus> {
  const [[owner], profile, integrations] = await Promise.all([
    ctx.db
      .select({ name: admins.name, nameConfirmedAt: admins.nameConfirmedAt })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1),
    getShopProfile(ctx.db),
    Promise.all(
      SETUP_OPTIONAL_STEPS.map(async (id) => [id, await INTEGRATION_CHECKS[id](ctx).catch(() => false)] as const),
    ),
  ])
  return computeSetup({
    owner: owner ?? { name: "", nameConfirmedAt: null },
    profile,
    integrations: Object.fromEntries(integrations) as Record<OptionalSetupStepId, boolean>,
  })
}
