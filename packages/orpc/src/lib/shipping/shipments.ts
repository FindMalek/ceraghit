import { ORPCError } from "@orpc/server"
import { type Db, orderItems, orders, products, settings, shipments, uploads } from "@workspace/db"
import type { AdminShipment, ShipmentDraft, ShipmentDraftInput, ShippingItem } from "@workspace/sdk"
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm"
import type { Services } from "../../context"
import { STORAGE_REFERENCES } from "../cleanup"
import { getIntegration } from "../integrations"
import { tryIssueInvoice } from "../invoices"
import { getSettings } from "../settings"
import { markOrderShipped } from "../shipping-events"
import { getShopProfile } from "../shop-profile"
import { reserveUpload } from "../uploads"
import { AramexError } from "./aramex/errors"
import { DEFAULT_ARAMEX_CONFIG } from "./aramex/provider"
import { ShippingError } from "./errors"
import { createShippingProvider } from "./index"
import { parcelFor } from "./quote"
import { aramexComplete, aramexDeps, effectiveMode } from "./resolve"
import { getShippingSettings } from "./settings"
import type { ShipAddress, ShippingProvider } from "./types"

export const NOT_CONFIGURED = "Aramex n'est pas configuré : choisissez Aramex et testez la connexion dans Livraison."
export const CANNOT_SHIP = "Cette commande ne peut pas être expédiée dans son état actuel."
export const ALREADY_SHIPPED = "Une expédition existe déjà pour cette commande."
export const COD_TUNISIA_ONLY = "Le paiement à la livraison n'existe qu'en Tunisie."
export const INTERNATIONAL_LATER = "Les envois internationaux arrivent avec la déclaration en douane."
export const NO_ANSWER = (number: string) =>
  `Aramex n'a pas répondu. Vérifiez sur votre espace Aramex avant de réessayer (référence ${number}).`
export const TOO_BIG = "Ce colis dépasse les limites Aramex (30 kg, 150 cm) : expédiez-le manuellement."
export const COUNTRY_CHANGED = "Le pays du destinataire ne peut pas différer de celui de la commande."
export const LABEL_UNAVAILABLE = "Étiquette indisponible."
const LABEL_FOLDER = "labels"
const CREATE_TIMEOUT_MS = 20_000
/** A label stays reachable this long after the parcel is closed (claims). */
const LABEL_KEEP_DAYS = 90
const DEFAULT_GRAMS = 1000

const isCod = (o: { paymentMethod: string; status: string }) =>
  o.paymentMethod === "cod" && o.status === "pending_payment"

async function loadOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) throw new ORPCError("NOT_FOUND", { message: "Commande introuvable." })
  return order
}

async function activeShipment(db: Db, orderId: string) {
  const [row] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(eq(shipments.orderId, orderId), ne(shipments.status, "cancelled")))
    .limit(1)
  return row ?? null
}

/** Aramex as configured (complete credentials), with its own timeout. Anything else cannot create a shipment. */
async function aramexFor(services: Services, timeoutMs: number) {
  const mode = await getShippingSettings(services.db)
  const found = mode.provider === "aramex" ? await getIntegration(services, "aramex") : null
  if (!found || !aramexComplete(found)) throw new ORPCError("PRECONDITION_FAILED", { message: NOT_CONFIGURED })
  const provider: ShippingProvider = createShippingProvider("aramex", aramexDeps(services, found, timeoutMs))
  const environment: "test" | "live" | "fake" = services.config.aramexFake
    ? "fake"
    : effectiveMode(services, found.config)
  return { provider, environment, config: found.config }
}

async function environmentOf(services: Services): Promise<"test" | "live" | "fake"> {
  if (services.config.aramexFake) return "fake"
  const found = await getIntegration(services, "aramex").catch(() => null)
  return found ? effectiveMode(services, found.config) : "test"
}

export async function prepareShipment(services: Services, orderId: string): Promise<ShipmentDraft> {
  const { db } = services
  const order = await loadOrder(db, orderId)
  const rows = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      ref: orderItems.ref,
      weightGrams: products.weightGrams,
      lengthCm: products.lengthCm,
      widthCm: products.widthCm,
      heightCm: products.heightCm,
    })
    .from(orderItems)
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, orderId))
  const warnings: string[] = []
  const lines: ShippingItem[] = rows.map((r) => {
    if (r.weightGrams === null) {
      warnings.push(`Le produit ${r.ref} n'existe plus : poids de ${DEFAULT_GRAMS} g par défaut, à vérifier.`)
    }
    return {
      quantity: r.quantity,
      weightGrams: r.weightGrams ?? DEFAULT_GRAMS,
      lengthCm: r.lengthCm ?? 20,
      widthCm: r.widthCm ?? 20,
      heightCm: r.heightCm ?? 10,
    }
  })
  const { shippingRates } = await getSettings(db)
  const parcel = parcelFor(shippingRates, lines)
  const cod = isCod(order) && order.country === "TN" && order.currency === "TND"
  const refs = [...new Set(rows.map((r) => r.ref))].join(" ")
  const description = `Céramique artisanale ${refs}`.trim().slice(0, 50)
  const fragile = true

  let blocked: string | null = null
  if (!(order.status === "paid" || isCod(order))) blocked = CANNOT_SHIP
  else if (await activeShipment(db, orderId)) blocked = ALREADY_SHIPPED
  else if (parcel.weightGrams > 30_000 || [parcel.lengthCm, parcel.widthCm, parcel.heightCm].some((d) => d > 150))
    blocked = TOO_BIG
  else if (order.country !== "TN") blocked = INTERNATIONAL_LATER
  else if (isCod(order) && !cod) blocked = COD_TUNISIA_ONLY

  return {
    orderId,
    orderNumber: order.number,
    currency: order.currency,
    environment: await environmentOf(services),
    consignee: {
      name: order.customerName,
      phone: order.phone,
      ...(order.email ? { email: order.email } : {}),
      line1: order.address,
      city: order.city,
      ...(order.postalCode ? { postalCode: order.postalCode } : {}),
      country: order.country,
    },
    parcel,
    description,
    fragile,
    codAmountMinor: cod ? order.totalMinor : null,
    insuranceSuggestedMinor: order.subtotalMinor,
    blocked,
    warnings,
  }
}

async function shipperAddress(services: Services, config: Record<string, unknown>): Promise<ShipAddress> {
  const shipper = config.shipper as
    | {
        companyName: string
        personName: string
        phone: string
        email: string
        line1: string
        line2?: string
        city: string
        postalCode?: string
      }
    | undefined
  if (shipper) {
    return {
      name: shipper.personName,
      company: shipper.companyName,
      phone: shipper.phone,
      email: shipper.email,
      line1: shipper.line1,
      ...(shipper.line2 ? { line2: shipper.line2 } : {}),
      city: shipper.city,
      ...(shipper.postalCode ? { postalCode: shipper.postalCode } : {}),
      country: "TN",
    }
  }
  const profile = await getShopProfile(services.db)
  return {
    name: profile.displayName ?? profile.legalName ?? "Ceraghit",
    phone: profile.phones[0] ?? "",
    line1: profile.address ?? "",
    city: profile.city ?? "",
    country: profile.country,
    ...(profile.postalCode ? { postalCode: profile.postalCode } : {}),
    ...(profile.email ? { email: profile.email } : {}),
  }
}

/** The label PDF goes under `private/labels/<uuid>.pdf`: an unguessable key `/files` refuses and only a signed link reads. */
async function storeLabel(services: Services, bytes: Uint8Array): Promise<string> {
  const { storage } = services
  if (!storage) throw new Error("storage is not configured")
  const key = `${storage.prefix}private/labels/${crypto.randomUUID()}.pdf`
  await reserveUpload(services.db, { key, folder: LABEL_FOLDER, contentType: "application/pdf", bytes: bytes.length })
  try {
    await storage.put(key, bytes, "application/pdf")
  } catch (error) {
    await services.db.delete(uploads).where(eq(uploads.key, key))
    throw error
  }
  return key
}

const labelError = (message: string) => ({ at: new Date().toISOString(), code: "LABEL", message })
const LABEL_FAILED = "L'étiquette n'a pas pu être enregistrée. Utilisez « Réessayer l'étiquette »."

export async function createShipment(
  services: Services,
  adminId: string,
  input: ShipmentDraftInput,
): Promise<{ shipmentId: string; waybill: string }> {
  const { db } = services
  const order = await loadOrder(db, input.orderId)
  if (!(order.status === "paid" || isCod(order))) throw new ORPCError("BAD_REQUEST", { message: CANNOT_SHIP })
  if (await activeShipment(db, order.id)) throw new ORPCError("CONFLICT", { message: ALREADY_SHIPPED })
  const cod = isCod(order)
  if (cod && !(input.consignee.country === "TN" && order.currency === "TND")) {
    throw new ORPCError("BAD_REQUEST", { message: COD_TUNISIA_ONLY })
  }
  if (input.consignee.country !== order.country) throw new ORPCError("BAD_REQUEST", { message: COUNTRY_CHANGED })
  if (input.consignee.country !== "TN") throw new ORPCError("BAD_REQUEST", { message: INTERNATIONAL_LATER })

  const { provider, environment, config } = await aramexFor(services, CREATE_TIMEOUT_MS)
  const release = await claimOrder(services, order.id)
  try {
    return await createClaimed(services, adminId, input, order, cod, { provider, environment, config })
  } finally {
    await release()
  }
}

/**
 * One create at a time per order: the claim row is written before Aramex is called and removed after. A claim older than
 * the Aramex timeout plus a margin is a crashed request and is taken over.
 */
async function claimOrder(services: Services, orderId: string): Promise<() => Promise<void>> {
  const key = `shipment-claim:${orderId}`
  const now = services.now()
  const stale = new Date(now.getTime() - 2 * CREATE_TIMEOUT_MS).toISOString()
  await services.db.delete(settings).where(and(eq(settings.key, key), sql`${settings.value}->>'at' < ${stale}`))
  const claimed = await services.db
    .insert(settings)
    .values({ key, value: { at: now.toISOString() } })
    .onConflictDoNothing()
    .returning({ key: settings.key })
  if (claimed.length === 0) throw new ORPCError("CONFLICT", { message: ALREADY_SHIPPED })
  return async () => {
    await services.db.delete(settings).where(eq(settings.key, key))
  }
}

async function createClaimed(
  services: Services,
  adminId: string,
  input: ShipmentDraftInput,
  order: typeof orders.$inferSelect,
  cod: boolean,
  { provider, environment, config }: Awaited<ReturnType<typeof aramexFor>>,
): Promise<{ shipmentId: string; waybill: string }> {
  const { db } = services
  // Re-checked under the claim: a create that finished while this one waited has already shipped the order.
  if (await activeShipment(db, order.id)) throw new ORPCError("CONFLICT", { message: ALREADY_SHIPPED })
  const from = await shipperAddress(services, config)
  const to: ShipAddress = {
    name: input.consignee.name,
    phone: input.consignee.phone,
    ...(input.consignee.email ? { email: input.consignee.email } : {}),
    line1: input.consignee.line1,
    city: input.consignee.city,
    ...(input.consignee.postalCode ? { postalCode: input.consignee.postalCode } : {}),
    country: input.consignee.country,
  }
  let created: Awaited<ReturnType<ShippingProvider["createShipment"]>>
  try {
    created = await provider.createShipment({
      reference: order.number,
      from,
      to,
      parcel: input.parcel,
      description: input.description,
      fragile: input.fragile,
      ...(cod ? { cod: { amountMinor: order.totalMinor, currency: "TND" as const } } : {}),
      ...(input.insurance ? { insurance: { amountMinor: input.insurance.amountMinor, currency: order.currency } } : {}),
      shipDate: services.now(),
    })
  } catch (error) {
    if (error instanceof AramexError) {
      console.error(`[shipment] ${order.number} ${error.code}`)
      const unknown = error.code === "TIMEOUT" || error.code === "UNREACHABLE"
      throw new ORPCError("BAD_REQUEST", { message: unknown ? NO_ANSWER(order.number) : error.message })
    }
    if (error instanceof ShippingError) throw new ORPCError("BAD_REQUEST", { message: error.message })
    throw error
  }

  const productType = DEFAULT_ARAMEX_CONFIG.productTypes[created.productGroup]
  const configured = (config.productTypes as Record<string, string> | undefined)?.[created.productGroup]
  const row = await db
    .insert(shipments)
    .values({
      orderId: order.id,
      provider: "aramex",
      environment,
      waybill: created.waybill,
      productGroup: created.productGroup,
      productType: configured ?? productType,
      codAmountMinor: cod ? order.totalMinor : null,
      insuranceMinor: input.insurance?.amountMinor ?? null,
      currency: order.currency,
      weightGrams: input.parcel.weightGrams,
      pieces: input.parcel.pieces,
      labelUrl: created.label.url,
    })
    .returning({ id: shipments.id })
    .catch((error: unknown) => {
      const code =
        (error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code
      if (code === "23505") throw new ORPCError("CONFLICT", { message: ALREADY_SHIPPED })
      throw error
    })
  const shipmentId = row[0]!.id

  await attachLabel(services, shipmentId, created.waybill, created.productGroup, provider, created.label.pdf)
  await markOrderShipped(services, order.id, { carrier: "aramex", trackingNumber: created.waybill }, { adminId })
  await tryIssueInvoice(db, order.id, services.now())
  return { shipmentId, waybill: created.waybill }
}

/** Stores the label when it can; otherwise keeps the shipment with a LABEL error so the owner can retry. */
async function attachLabel(
  services: Services,
  shipmentId: string,
  waybill: string,
  group: "DOM" | "EXP",
  provider: ShippingProvider,
  pdf: Uint8Array | null,
): Promise<boolean> {
  try {
    let bytes = pdf
    if (!bytes) bytes = (await provider.getLabel(waybill, group)).pdf
    if (!bytes) throw new Error("no label bytes")
    const key = await storeLabel(services, bytes)
    await services.db
      .update(shipments)
      .set({
        labelKey: key,
        errors: sql`(select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(${shipments.errors}) e where e->>'code' <> 'LABEL')`,
      })
      .where(eq(shipments.id, shipmentId))
    return true
  } catch (error) {
    console.error(`[shipment] label ${waybill} ${error instanceof AramexError ? error.code : "failed"}`)
    await services.db
      .update(shipments)
      .set({ errors: sql`${shipments.errors} || ${JSON.stringify([labelError(LABEL_FAILED)])}::jsonb` })
      .where(eq(shipments.id, shipmentId))
    return false
  }
}

async function loadShipment(db: Db, shipmentId: string) {
  const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1)
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Expédition introuvable." })
  return row
}

export async function retryLabel(services: Services, shipmentId: string): Promise<void> {
  const row = await loadShipment(services.db, shipmentId)
  if (row.labelKey) return
  const { provider } = await aramexFor(services, CREATE_TIMEOUT_MS)
  const ok = await attachLabel(
    services,
    row.id,
    row.waybill,
    row.productGroup === "EXP" ? "EXP" : "DOM",
    provider,
    null,
  )
  if (!ok) throw new ORPCError("BAD_REQUEST", { message: LABEL_FAILED })
}

/** A 5 minute signed link, saved as `<waybill>.pdf` (`inline` opens it in the browser to print). Never the public url: the key is private. */
export async function labelDownloadUrl(services: Services, shipmentId: string, inline = false): Promise<string> {
  const row = await loadShipment(services.db, shipmentId)
  if (!row.labelKey || !services.storage) throw new ORPCError("NOT_FOUND", { message: LABEL_UNAVAILABLE })
  return services.storage.signedGet(row.labelKey, 300, inline ? undefined : `${row.waybill}.pdf`)
}

export async function getOrderShipment(db: Db, orderId: string): Promise<AdminShipment | null> {
  const [row] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .orderBy(sql`(${shipments.status} = 'cancelled')`, desc(shipments.createdAt))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment as AdminShipment["environment"],
    waybill: row.waybill,
    productGroup: row.productGroup,
    status: row.status,
    codAmountMinor: row.codAmountMinor,
    insuranceMinor: row.insuranceMinor,
    currency: row.currency,
    hasLabel: row.labelKey !== null,
    errors: row.errors,
    events: [...row.events]
      .reverse()
      .map(({ code, description, at, location }) => ({ code, description, at, location })),
    lastPolledAt: row.lastPolledAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Labels (and later customs invoices) of an open parcel, or one closed less than 90 days ago, are never deleted
 * by the storage cleanup, whatever folder rule it uses.
 */
export async function shipmentProtectedKeys(db: Db): Promise<string[]> {
  const rows = await db
    .select({ label: shipments.labelKey, invoice: shipments.commercialInvoiceKey })
    .from(shipments)
    .where(
      or(
        inArray(shipments.status, ["created", "picked_up", "in_transit", "out_for_delivery", "exception", "on_hold"]),
        sql`coalesce(${shipments.deliveredAt}, ${shipments.createdAt}) > now() - make_interval(days => ${LABEL_KEEP_DAYS})`,
      ),
    )
  return rows.flatMap((r) => [r.label, r.invoice]).filter((k): k is string => !!k)
}

if (!STORAGE_REFERENCES.includes(shipmentProtectedKeys)) STORAGE_REFERENCES.push(shipmentProtectedKeys)
