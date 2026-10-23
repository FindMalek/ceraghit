import { count } from "drizzle-orm"
import type { Db } from "../index"
import { hashPassword } from "../password"
import { admins, categories, locations, orderItems, orders, productImages, products, productVariants } from "../schema"
import { CATALOGUE, CATEGORIES } from "./catalogue"
import { buildScenario } from "./scenario"
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
  /** Created, or its password reset, on every start: env is the source of truth for this login. */
  admin?: { email: string; password: string; name?: string }
  /** The real catalogue from the PDF. Only ever written into an empty database. */
  catalog?: boolean
  /** Fake orders and placeholder locations so previews have numbers to show. Implies the catalogue. */
  demo?: boolean
}

export async function seed(db: Db, opts: SeedOptions): Promise<{ admin: boolean; catalog: boolean; demo: boolean }> {
  const done = { admin: false, catalog: false, demo: false }
  if (opts.admin?.email && opts.admin.password) {
    const passwordHash = await hashPassword(opts.admin.password)
    await db
      .insert(admins)
      .values({ email: opts.admin.email.toLowerCase(), name: opts.admin.name ?? "Sabri Ghit", passwordHash })
      .onConflictDoUpdate({ target: admins.email, set: { passwordHash } })
    done.admin = true
  }
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
            .normalize("NFD")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}-${p.ref}`,
          categoryId: categoryId.get(p.category)!,
          title: localize(p.title),
          description: p.description ? localize(p.description) : null,
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
    await tx
      .insert(productImages)
      .values(
        rows.flatMap((row) =>
          byRef.get(row.ref)!.images.map((image, position) => ({ productId: row.id, image, position })),
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
    await tx.insert(locations).values([
      {
        name: "Atelier Ceraghit (exemple)",
        address: "Adresse à renseigner dans le dashboard",
        city: "Tunis",
        position: 0,
      },
      {
        name: "Atelier Bruxelles (exemple)",
        address: "Adresse à renseigner dans le dashboard",
        city: "Bruxelles",
        country: "Belgique",
        position: 1,
      },
    ])
    const scenario = buildScenario(
      new Date(),
      rows
        .filter((r) => !byRef.get(r.ref)!.quoteOnly)
        .map((r) => ({ id: r.id, ref: r.ref, title: r.title.fr, priceTnd: r.priceTnd, priceEur: r.priceEur })),
    )
    await tx.insert(orders).values(scenario.orders)
    await tx.insert(orderItems).values(scenario.items)
    done.demo = true
  })
  return done
}
