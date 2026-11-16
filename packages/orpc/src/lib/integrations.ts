import { ORPCError } from "@orpc/server"
import { type Db, integrationCredentials } from "@workspace/db"
import {
  INTEGRATION_CONFIG_SCHEMAS,
  INTEGRATIONS,
  type IntegrationProvider,
  type MaskedIntegration,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { decryptJson, encryptJson, integrationAad, type Keyring, SecretsError } from "./secrets"

export interface ResolvedIntegration {
  provider: IntegrationProvider
  config: Record<string, unknown>
  secrets: Record<string, string>
  source: "db" | "env"
}

type Row = typeof integrationCredentials.$inferSelect

export const UNREADABLE = "Les clés enregistrées sont illisibles. Effacez-les puis saisissez-les à nouveau."
export const VAULT_KEY_REQUIRED =
  "Les identifiants enregistrés ne peuvent pas être lus : la clé du coffre (SECRETS_KEY) est absente de ce serveur."
export const VAULT_UNAVAILABLE = "Le coffre des clés n'est pas configuré sur ce serveur."

const secretFields = (provider: IntegrationProvider): readonly string[] => INTEGRATIONS[provider].secretFields

async function loadRow(db: Db, provider: IntegrationProvider): Promise<Row | null> {
  const [row] = await db.select().from(integrationCredentials).where(eq(integrationCredentials.provider, provider))
  return row ?? null
}

function decryptRow(keyring: Keyring | null, row: Row): Record<string, string> {
  if (!row.secretsEnc || row.keyVersion === null) return {}
  if (!keyring) throw new SecretsError("cannot decrypt")
  return decryptJson(keyring, row.secretsEnc, row.keyVersion, integrationAad(row.provider))
}

function fromEnv(services: Services, provider: IntegrationProvider): ResolvedIntegration | null {
  const env = services.config.envCredentials?.[provider]
  if (!env) return null
  const secrets: Record<string, string> = {}
  const config: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue
    if (secretFields(provider).includes(key)) secrets[key] = value
    else config[key] = value
  }
  return Object.keys(secrets).length === 0 && Object.keys(config).length === 0
    ? null
    : { provider, config, secrets, source: "env" }
}

/** A DB row with secrets wins as a whole, otherwise the env values are used, never a mix of both. */
export async function getIntegration(
  services: Services,
  provider: IntegrationProvider,
): Promise<ResolvedIntegration | null> {
  const row = await loadRow(services.db, provider)
  if (row?.secretsEnc) {
    try {
      return { provider, config: row.config, secrets: decryptRow(services.secrets ?? null, row), source: "db" }
    } catch (error) {
      if (!(error instanceof SecretsError)) throw error
    }
  }
  return fromEnv(services, provider)
}

/** What provider clients call: `{ ...config, ...secrets }`, or null when neither the DB nor the env has it. */
export async function getSecret(
  services: Services,
  provider: IntegrationProvider,
): Promise<Record<string, unknown> | null> {
  const found = await getIntegration(services, provider)
  return found ? { ...found.config, ...found.secrets } : null
}

export interface SaveInput {
  config?: Record<string, unknown> | undefined
  /** Omitted field keeps the stored value, null clears it, a string replaces it. */
  secrets?: Record<string, string | null | undefined> | undefined
}

export async function saveIntegration(
  services: Services,
  adminId: string,
  provider: IntegrationProvider,
  input: SaveInput,
): Promise<void> {
  const keyring = services.secrets ?? null
  if (!keyring) throw new ORPCError("PRECONDITION_FAILED", { message: VAULT_UNAVAILABLE })
  const allowed = secretFields(provider)
  if (Object.keys(input.secrets ?? {}).some((k) => !allowed.includes(k))) {
    throw new ORPCError("BAD_REQUEST", { message: "Champ inconnu." })
  }
  const config = input.config ? INTEGRATION_CONFIG_SCHEMAS[provider].safeParse(input.config) : null
  if (config && !config.success) throw new ORPCError("BAD_REQUEST", { message: "Réglage invalide." })

  await services.db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(integrationCredentials)
      .where(eq(integrationCredentials.provider, provider))
      .for("update")
    let merged: Record<string, string>
    try {
      merged = existing ? decryptRow(keyring, existing) : {}
    } catch (error) {
      if (!(error instanceof SecretsError)) throw error
      throw new ORPCError("PRECONDITION_FAILED", { message: UNREADABLE })
    }
    for (const [field, value] of Object.entries(input.secrets ?? {})) {
      if (value === null) delete merged[field]
      else if (value !== undefined) merged[field] = value.trim()
    }
    const sealed = Object.keys(merged).length
      ? encryptJson(keyring, merged, integrationAad(provider))
      : { secretsEnc: null, keyVersion: null }
    const values = {
      config: (config?.success ? config.data : (existing?.config ?? {})) as Record<string, unknown>,
      ...sealed,
      updatedAt: services.now(),
      updatedBy: adminId,
    }
    await tx
      .insert(integrationCredentials)
      .values({ provider, ...values })
      .onConflictDoUpdate({ target: integrationCredentials.provider, set: values })
  })
}

/** Keeps the row with secrets emptied so who cleared it and when survives; reads then use the env values. */
export async function clearIntegration(
  db: Db,
  provider: IntegrationProvider,
  adminId: string,
  now: Date,
): Promise<void> {
  await db
    .update(integrationCredentials)
    .set({ config: {}, secretsEnc: null, keyVersion: null, updatedAt: now, updatedBy: adminId })
    .where(eq(integrationCredentials.provider, provider))
}

/** Only API-key style fields get a hint; passwords and PINs never do. */
const hintOf = (field: string, value: string) =>
  /key$/i.test(field) && value.length >= 16 ? `••••${value.slice(-4)}` : null

/** The only shape a client ever sees: which secrets are set, plus a last-4 hint for long API keys. */
export async function describeIntegration(
  services: Services,
  provider: IntegrationProvider,
): Promise<MaskedIntegration> {
  const row = await loadRow(services.db, provider)
  let resolved: ResolvedIntegration | null = null
  let unreadable = false
  try {
    resolved = row?.secretsEnc
      ? { provider, config: row.config, secrets: decryptRow(services.secrets ?? null, row), source: "db" }
      : fromEnv(services, provider)
  } catch (error) {
    if (!(error instanceof SecretsError)) throw error
    unreadable = true
  }
  const secrets: MaskedIntegration["secrets"] = {}
  for (const field of secretFields(provider)) {
    const value = resolved?.secrets[field]
    secrets[field] = { configured: unreadable ? true : !!value, hint: value ? hintOf(field, value) : null }
  }
  return {
    provider,
    config: (resolved?.config ?? row?.config ?? {}) as Record<string, unknown>,
    secrets,
    source: unreadable ? "db" : (resolved?.source ?? "none"),
    vaultAvailable: !!services.secrets,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

/** Re-encrypts every row not yet on the current key version, in one transaction. Idempotent. */
export async function rotateSecrets(db: Db, keyring: Keyring): Promise<{ rotated: number }> {
  return db.transaction(async (tx) => {
    let rotated = 0
    for (const row of await tx.select().from(integrationCredentials).for("update")) {
      if (!row.secretsEnc || row.keyVersion === keyring.current.version) continue
      const plain = decryptRow(keyring, row)
      const sealed = encryptJson(keyring, plain, integrationAad(row.provider))
      await tx.update(integrationCredentials).set(sealed).where(eq(integrationCredentials.provider, row.provider))
      rotated++
    }
    return { rotated }
  })
}

/** True when a row holds sealed secrets, which nothing can read without a key. */
export async function hasSealedSecrets(db: Db): Promise<boolean> {
  const rows = await db
    .select({ provider: integrationCredentials.provider, enc: integrationCredentials.secretsEnc })
    .from(integrationCredentials)
  return rows.some((r) => !!r.enc)
}

/** Boot guard: no key but saved secrets means every provider call would silently fall back, so refuse to start. */
export async function assertVaultKeyForRows(db: Db, keyring: Keyring | null): Promise<void> {
  if (!keyring && (await hasSealedSecrets(db))) {
    throw new Error(
      "integration_credentials holds secrets but SECRETS_KEY is not set: set the key this data was saved with",
    )
  }
}

/** Using saved credentials without the key is refused with a clear message instead of a silent env fallback. */
export async function assertVaultReadable(services: Services): Promise<void> {
  if (!services.secrets && (await hasSealedSecrets(services.db))) {
    throw new ORPCError("PRECONDITION_FAILED", { message: VAULT_KEY_REQUIRED })
  }
}
