import type { EmailDomain } from "@workspace/sdk"
import type { Services } from "../context"
import {
  type DomainRecord,
  domainOfFrom,
  emailDomainState,
  getDomain,
  listDomains,
  verifyDomain,
} from "./resend-domains"
import { getShopProfile } from "./shop-profile"

const PURPOSE: Record<string, string> = { SPF: "SPF", DKIM: "DKIM", MX: "Retour (MX)", DMARC: "DMARC" }

const mapRecord = (r: DomainRecord): EmailDomain["records"][number] => ({
  purpose: PURPOSE[r.record] ?? r.record,
  type: r.type,
  name: r.name,
  value: r.value,
  priority: r.priority ?? null,
  status: r.status,
})

/**
 * The sending domain's state at Resend. The api key never leaves this function: the answer holds the DNS records the
 * owner must add and nothing else. With `verify`, Resend is asked to re-check the DNS first.
 */
export async function loadEmailDomain(ctx: Services, opts: { verify?: boolean } = {}): Promise<EmailDomain> {
  const from = ctx.config.emailFrom ?? ""
  const domain = domainOfFrom(from)
  const empty = { domain, from, records: [], dmarc: null }
  const key = ctx.config.resendApiKey
  if (!key || !domain) return { ...empty, state: "not_configured" }
  const http = ctx.http ?? fetch

  const list = await listDomains(key, http)
  if (list.kind === "restricted_key") return { ...empty, state: "restricted_key" }
  if (list.kind === "unavailable") return { ...empty, state: "failed" }
  const found = list.value.data.find((d) => d.name.toLowerCase() === domain)
  if (!found) return { ...empty, state: "not_found" }

  if (opts.verify) await verifyDomain(key, found.id, http)
  const detail = await getDomain(key, found.id, http)
  if (detail.kind === "restricted_key") return { ...empty, state: "restricted_key" }
  if (detail.kind === "unavailable") return { ...empty, state: "failed" }

  const profile = await getShopProfile(ctx.db)
  const rua = profile.notifyEmail ?? profile.email
  return {
    state: emailDomainState(detail.value),
    domain,
    from,
    records: detail.value.records.map(mapRecord),
    dmarc: rua ? { name: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:${rua}` } : null,
  }
}
