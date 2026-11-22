import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { decryptJson, integrationAad, parseKeyring } from "../../../../packages/orpc/src/lib/secrets"
import { apiEnv, E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const HEADERS = { "x-csrf-token": "orpc" }

test("a saved secret is encrypted in the database, decrypts to what was typed, and never reaches the api log", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  const suffix = randomBytes(6).toString("hex")
  const groq = `sk_e2e_groq_${suffix}`
  const aramex = { password: `pw_e2e_${suffix}`, accountPin: `pin_e2e_${suffix}` }
  const api = page.request
  const clear = async () => {
    for (const provider of ["groq", "aramex"])
      await api.delete(`${E2E.apiUrl}/v1/admin/integrations/${provider}`, { headers: HEADERS })
  }
  const keyring = parseKeyring(apiEnv().SECRETS_KEY)
  expect(keyring, "the e2e api runs with a vault key").not.toBeNull()

  await loginAsOwnerAndWait(page)
  await clear()
  try {
    await step("the owner saves a Groq key and the Aramex password and pin", async () => {
      const saved = await api.put(`${E2E.apiUrl}/v1/admin/integrations/groq`, {
        headers: HEADERS,
        data: { secrets: { apiKey: groq } },
      })
      expect(saved.ok(), await saved.text()).toBe(true)
      const second = await api.put(`${E2E.apiUrl}/v1/admin/integrations/aramex`, {
        headers: HEADERS,
        data: { config: { userName: `e2e-${suffix}` }, secrets: aramex },
      })
      expect(second.ok(), await second.text()).toBe(true)
    })

    await step("the database holds ciphertext, never the typed value", async () => {
      const rows = await dbQuery<{ provider: string; secretsEnc: string | null; keyVersion: number | null }>(
        `select provider, secrets_enc as "secretsEnc", key_version as "keyVersion" from integration_credentials
         where provider in ('groq', 'aramex')`,
        [],
      )
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.secretsEnc).toMatch(/^v1\./)
        expect(row.keyVersion).toBe(keyring?.current.version)
        for (const value of [groq, ...Object.values(aramex)]) expect(row.secretsEnc).not.toContain(value)
      }
    })

    await step("decrypting with the vault key gives back exactly what was saved", async () => {
      if (!keyring) throw new Error("no keyring")
      const rows = await dbQuery<{ provider: string; secretsEnc: string; keyVersion: number }>(
        `select provider, secrets_enc as "secretsEnc", key_version as "keyVersion" from integration_credentials
         where provider in ('groq', 'aramex')`,
        [],
      )
      const plain = Object.fromEntries(
        rows.map((r) => [r.provider, decryptJson(keyring, r.secretsEnc, r.keyVersion, integrationAad(r.provider))]),
      )
      expect(plain.groq).toEqual({ apiKey: groq })
      expect(plain.aramex).toEqual(aramex)
    })

    await step("a ciphertext cannot be moved to another provider", async () => {
      if (!keyring) throw new Error("no keyring")
      const [row] = await dbQuery<{ secretsEnc: string; keyVersion: number }>(
        `select secrets_enc as "secretsEnc", key_version as "keyVersion" from integration_credentials where provider = 'groq'`,
        [],
      )
      expect(() =>
        decryptJson(keyring, row?.secretsEnc ?? "", row?.keyVersion ?? 0, integrationAad("aramex")),
      ).toThrow()
    })

    await step("the api log was captured and holds none of the values", async () => {
      await api.get(`${E2E.apiUrl}/v1/admin/integrations/groq`, { headers: HEADERS })
      await api.get(`${E2E.apiUrl}/v1/admin/integrations/aramex`, { headers: HEADERS })
      expect(existsSync(E2E.apiLog), `the api stdout is written to ${E2E.apiLog}`).toBe(true)
      const log = readFileSync(E2E.apiLog, "utf8")
      expect(log.length, "the log is not empty").toBeGreaterThan(0)
      for (const value of [groq, ...Object.values(aramex), E2E.adminPassword, E2E.cronSecret])
        expect(log, "the api log must not hold a secret").not.toContain(value)
    })
  } finally {
    await clear()
  }
})
