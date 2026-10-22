import { customRequests, orderItems, orders, products } from "@workspace/db"
import { statsRangeSchema, statsSchema } from "@workspace/sdk"
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { releaseExpiredHolds } from "../../lib/orders"
import { adminProcedure } from "../../procedures"

const PAID = ["paid", "fulfilled"] as const

export const overview = adminProcedure
  .route({ method: "GET", path: "/admin/stats", summary: "Sales numbers for the dashboard", tags: ["admin"] })
  .input(statsRangeSchema)
  .output(statsSchema)
  .handler(async ({ context, input }) => {
    const { db } = context
    const now = context.now()
    await releaseExpiredHolds(db, now)
    const since = new Date(now.getTime() - input.days * 864e5)
    const inRange = and(inArray(orders.status, PAID), gte(orders.paidAt, since))

    const totals = await db
      .select({
        currency: orders.currency,
        revenue: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
        n: count(),
      })
      .from(orders)
      .where(inRange)
      .groupBy(orders.currency)
    const of = (c: "TND" | "EUR") => totals.find((t) => t.currency === c)
    const revenue = { TND: of("TND")?.revenue ?? 0, EUR: of("EUR")?.revenue ?? 0 }
    const paidOrders = (of("TND")?.n ?? 0) + (of("EUR")?.n ?? 0)
    const average = (c: "TND" | "EUR") => (of(c)?.n ? Math.round(revenue[c] / of(c)!.n) : 0)

    const [{ pending } = { pending: 0 }] = await db
      .select({ pending: count() })
      .from(orders)
      .where(eq(orders.status, "pending_payment"))

    const day = sql<string>`to_char(${orders.paidAt} at time zone 'Africa/Tunis', 'YYYY-MM-DD')`
    const days = await db
      .select({
        day,
        currency: orders.currency,
        revenue: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
        orders: count(),
      })
      .from(orders)
      .where(inRange)
      .groupBy(day, orders.currency)
      .orderBy(asc(day))
    const byDay = new Map<string, { day: string; TND: number; EUR: number; orders: number }>()
    for (const r of days) {
      const row = byDay.get(r.day) ?? { day: r.day, TND: 0, EUR: 0, orders: 0 }
      row[r.currency] += r.revenue
      row.orders += r.orders
      byDay.set(r.day, row)
    }

    const topProducts = await db
      .select({ ref: orderItems.ref, title: orderItems.title, quantity: sql<number>`sum(${orderItems.quantity})::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(inRange)
      .groupBy(orderItems.ref, orderItems.title)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5)

    const byCountry = await db
      .select({ country: orders.country, orders: count() })
      .from(orders)
      .where(inRange)
      .groupBy(orders.country)
      .orderBy(desc(count()))
      .limit(8)

    const lowStock = await db
      .select({
        id: products.id,
        ref: products.ref,
        title: sql<string>`${products.title}->>'fr'`,
        stock: products.stock,
      })
      .from(products)
      .where(and(eq(products.status, "published"), lte(products.stock, 2)))
      .orderBy(asc(products.stock), asc(products.ref))
      .limit(8)

    const newRequests = await db.$count(customRequests, eq(customRequests.status, "new"))

    return {
      days: input.days,
      revenue,
      paidOrders,
      pendingOrders: pending,
      averageOrder: { TND: average("TND"), EUR: average("EUR") },
      newRequests,
      byDay: [...byDay.values()],
      topProducts,
      byCountry,
      lowStock,
    }
  })
