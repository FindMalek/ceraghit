import { count, eq, inArray } from "drizzle-orm"
import type { Db } from "../index"
import { withSeedLock } from "../migrate"
import { hashPassword } from "../password"
import {
  admins,
  categories,
  customRequests,
  jobRuns,
  locations,
  mailLog,
  media,
  orderAudit,
  orderItems,
  orders,
  productImages,
  products,
  productVariants,
  settings,
  shipments,
  shopProfile,
} from "../schema"
import { CATALOGUE, CATEGORIES } from "./catalogue"
import {
  DEMO_HIDDEN_HERO,
  DEMO_MAIN_SECOND_REF,
  DEMO_MEDIA_BY_REF,
  DEMO_UNUSED_MEDIA,
  ensureSiteImages,
  syncBundledMedia,
} from "./media"
import {
  buildDemoProfile,
  buildScenario,
  DEMO_DESCRIPTIONS,
  DEMO_LOCATIONS,
  DEMO_TN_CITIES,
  demoExtraProducts,
  demoRequests,
} from "./scenario"
import { localize } from "./translations"

export { buildScenario } from "./scenario"

/** Every glazed lampe votive also exists unglazed for 5 EUR less (0210 is already the unglazed one). */
const UNGLAZED_VARIANT_REFS = new Set([
  "0200",
  "0201",
  "0202",
  "0203",
  "0204",
  "0205",
  "0206",
  "0207",
  "0208",
  "0209",
  "0211",
])
const UNGLAZED_DISCOUNT_EUR = 500

export interface SeedOptions {
  /**
   * Created when missing. An existing login keeps its password (the owner can change it in the dashboard) unless
   * `rotatePassword` is set, which makes this value win again.
   */
  admin?: { email: string; password: string; name?: string; rotatePassword?: boolean }
  /** The real catalogue from the PDF. Only ever written into an empty database. */
  catalog?: boolean
  /** Fake orders and placeholder locations so previews have numbers to show. Implies the catalogue. */
  demo?: boolean
  /** Demo only. "complete" is an onboarded shop, "empty" leaves the profile blank so the onboarding starts. Default "complete". */
  profile?: "complete" | "empty"
}

export async function seed(db: Db, opts: SeedOptions): Promise<{ admin: boolean; catalog: boolean; demo: boolean }> {
  return withSeedLock(db, async () => {
    const done = await seedRows(db, opts)
    await syncBundledMedia(db)
    return done
  })
}

async function seedRows(db: Db, opts: SeedOptions): Promise<{ admin: boolean; catalog: boolean; demo: boolean }> {
  if (opts.demo && process.env.APP_ENV === "production")
    throw new Error("the demo seed is refused when APP_ENV=production")
  const done = { admin: false, catalog: false, demo: false }
  if (opts.admin?.email && opts.admin.password) {
    const passwordHash = await hashPassword(opts.admin.password)
    const insert = db
      .insert(admins)
      .values({ email: opts.admin.email.toLowerCase(), name: opts.admin.name ?? "Sabri Ghit", passwordHash })
    // The name belongs to the owner after onboarding, and so does the password once they changed it.
    await (opts.admin.rotatePassword
      ? insert.onConflictDoUpdate({ target: admins.email, set: { passwordHash } })
      : insert.onConflictDoNothing({ target: admins.email }))
    done.admin = true
  }
  await syncBundledMedia(db)
  await ensureSiteImages(db, { demo: opts.demo })
  if (!opts.catalog && !opts.demo) return done

  const [existing] = await db.select({ n: count() }).from(categories)
  if ((existing?.n ?? 0) > 0) return done

  await db.transaction(async (tx) => {
    const cats = await tx
      .insert(categories)
      .values(CATEGORIES.map((c, position) => ({ slug: c.slug, name: localize(c.name.fr), image: c.image, position })))
      .returning({ id: categories.id, slug: categories.slug })
    const categoryId = new Map(cats.map((c) => [c.slug, c.id]))
    const rows = await tx
      .insert(products)
      .values(
        CATALOGUE.map((p, position) => ({
          ref: p.ref,
          slug: `${p.title
            .toLowerCase()
            .replace(/œ/g, "oe")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}-${p.ref}`,
          categoryId: categoryId.get(p.category)!,
          title: localize(p.title),
          description: p.description ? localize(p.description) : opts.demo ? (DEMO_DESCRIPTIONS[p.ref] ?? null) : null,
          material: localize(p.material),
          technique: localize(p.technique),
          dimensions: p.dimensions,
          weightGrams: p.weightGrams,
          lengthCm: p.lengthCm,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          priceTnd: p.priceTnd,
          priceEur: p.priceEur,
          stock: p.unique ? 1 : 3,
          unique: p.unique,
          quoteOnly: p.quoteOnly,
          status: "published" as const,
          featured: ["0200", "0050", "0001", "0013", "0004", "0051"].includes(p.ref),
          position,
        })),
      )
      .returning({
        id: products.id,
        ref: products.ref,
        title: products.title,
        priceTnd: products.priceTnd,
        priceEur: products.priceEur,
      })
    const byRef = new Map(CATALOGUE.map((p) => [p.ref, p]))
    const demoByPath = new Map(
      opts.demo
        ? CATALOGUE.flatMap((p) =>
            DEMO_MEDIA_BY_REF[p.ref] && p.images[0] ? [[p.images[0], DEMO_MEDIA_BY_REF[p.ref]]] : [],
          )
        : [],
    )
    const paths = [...new Set(CATALOGUE.flatMap((p) => p.images))]
    for (const [path, demo] of demoByPath) if (demo) await tx.update(media).set(demo).where(eq(media.key, path))
    const mediaRows = await tx.select({ id: media.id, key: media.key }).from(media).where(inArray(media.key, paths))
    if (opts.demo)
      await tx
        .insert(media)
        .values({ ...DEMO_UNUSED_MEDIA, bytes: 1, confirmedAt: new Date(), unusedSince: new Date() })
        .onConflictDoNothing({ target: media.key })
    const mediaByKey = new Map(mediaRows.map((m) => [m.key, m.id]))
    await tx.insert(productImages).values(
      rows.flatMap((row) =>
        byRef.get(row.ref)!.images.map((image, position) => ({
          productId: row.id,
          image,
          position,
          mediaId: mediaByKey.get(image) ?? null,
          isMain: position === (opts.demo && row.ref === DEMO_MAIN_SECOND_REF ? 1 : 0),
        })),
      ),
    )
    await tx.insert(productVariants).values(
      rows.flatMap((row) => {
        if (!UNGLAZED_VARIANT_REFS.has(row.ref)) return []
        const unglazedEur = row.priceEur - UNGLAZED_DISCOUNT_EUR
        return [
          {
            productId: row.id,
            label: localize("Émaillée"),
            priceTnd: row.priceTnd,
            priceEur: row.priceEur,
            stock: 3,
            position: 0,
          },
          {
            productId: row.id,
            label: localize("Terre cuite non émaillée"),
            priceTnd: Math.round(((unglazedEur / 100) * 3.4) / 5) * 5 * 1000,
            priceEur: unglazedEur,
            stock: 3,
            position: 1,
          },
        ]
      }),
    )
    done.catalog = true

    if (!opts.demo) return
    await tx.insert(locations).values(DEMO_LOCATIONS)
    await tx.insert(products).values(demoExtraProducts(cats.map((c) => c.id)))
    await tx.insert(customRequests).values(demoRequests(new Date()))
    if ((opts.profile ?? "complete") === "complete") {
      const now = new Date()
      const profile = buildDemoProfile(now)
      await tx.insert(shopProfile).values(profile).onConflictDoUpdate({ target: shopProfile.id, set: profile })
      if (opts.admin?.email) {
        await tx.update(admins).set({ nameConfirmedAt: now }).where(eq(admins.email, opts.admin.email.toLowerCase()))
      }
    }
    const scenario = buildScenario(
      new Date(),
      rows
        .filter((r) => !byRef.get(r.ref)!.quoteOnly)
        .map((r) => ({ id: r.id, ref: r.ref, title: r.title.fr, priceTnd: r.priceTnd, priceEur: r.priceEur })),
    )
    await tx.insert(orders).values(scenario.orders)
    await tx.insert(orderItems).values(scenario.items)
    if (scenario.shipments.length) await tx.insert(shipments).values(scenario.shipments)
    if (scenario.audit.length) await tx.insert(orderAudit).values(scenario.audit)
    if (scenario.mail.length) await tx.insert(mailLog).values(scenario.mail)
    await tx.insert(jobRuns).values(scenario.jobRuns)
    await tx
      .insert(settings)
      .values({ key: "payments", value: { methods: { online: true, cod: true, transfer: true, payoneer: true } } })
      .onConflictDoNothing()
    await tx
      .insert(settings)
      .values({
        key: "aramex:cities:TN",
        value: { cities: DEMO_TN_CITIES, fetchedAt: new Date().toISOString(), fixture: true },
      })
      .onConflictDoNothing()
    await tx
      .insert(settings)
      .values({ key: "shipping", value: { provider: "manual", quoteFromProvider: false } })
      .onConflictDoNothing()
    done.demo = true
  })
  return done
}
