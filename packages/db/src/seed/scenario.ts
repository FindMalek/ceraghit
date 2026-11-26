import { demoRef } from "../demo-ref"
import type {
  customRequests,
  jobRuns,
  Localized,
  locations,
  mailLog,
  orderAudit,
  orderItems,
  orders,
  products,
  shipments,
  shopProfile,
} from "../schema"

type NewOrder = typeof orders.$inferInsert
type NewItem = typeof orderItems.$inferInsert
type NewAudit = typeof orderAudit.$inferInsert
type NewMail = typeof mailLog.$inferInsert
type NewShipment = typeof shipments.$inferInsert
type NewJobRun = typeof jobRuns.$inferInsert
type NewLocation = typeof locations.$inferInsert
type NewProfile = typeof shopProfile.$inferInsert

/** The studio settings of the demo: WhatsApp and Instagram shown in the footer. Rates stay the defaults. */
export function demoStudioSettings(rates: unknown) {
  return { whatsapp: "+216 20 000 000", instagram: "@ceraghit_demo", shippingRates: rates, shippingNote: null }
}

export interface ScenarioProduct {
  id: string
  ref: string
  title: string
  priceTnd: number
  priceEur: number
}

const PEOPLE = [
  "Amel Trabelsi",
  "Karim Ben Salah",
  "Sonia Gharbi",
  "Youssef Mejri",
  "Lina Dupont",
  "Marc Peeters",
  "Inès Haddad",
  "Julien Martin",
]
const TN_CITIES = ["Tunis", "La Marsa", "Sousse", "Sfax", "Hammamet", "Nabeul"]
/** Stands in for the Aramex list on a demo, so the checkout city picker shows without Aramex. Every demo city is in it. */
export const DEMO_TN_CITIES = [
  "Ariana",
  "Béja",
  "Ben Arous",
  "Bizerte",
  "Djerba Houmt Souk",
  "Gabès",
  "Gafsa",
  "Hammamet",
  "Jendouba",
  "Kairouan",
  "Kasserine",
  "Kébili",
  "La Marsa",
  "Le Kef",
  "Mahdia",
  "Manouba",
  "Médenine",
  "Monastir",
  "Nabeul",
  "Sfax",
  "Sidi Bouzid",
  "Siliana",
  "Sousse",
  "Tataouine",
  "Tozeur",
  "Tunis",
  "Zaghouan",
]
const STREETS: Record<string, string[]> = {
  Tunis: ["rue de Marseille", "avenue Habib Bourguiba", "rue Charles de Gaulle"],
  "La Marsa": ["avenue Taieb Mhiri", "rue Hédi Chaker"],
  Sousse: ["boulevard de la Corniche", "rue Ibn Khaldoun"],
  Sfax: ["avenue Hédi Chaker", "rue Mongi Slim"],
  Hammamet: ["avenue de la République", "rue des Jasmins"],
  Nabeul: ["rue des Potiers", "avenue Farhat Hached"],
  Bruxelles: ["rue Haute", "avenue Louise"],
  Lyon: ["rue de la République", "quai Saint-Antoine"],
  Berlin: ["Oranienstraße", "Kastanienallee"],
}
const ORDER_LOCALES = ["fr", "en", "ar"] as const
const ABROAD = [
  { country: "BE", city: "Bruxelles" },
  { country: "FR", city: "Lyon" },
  { country: "DE", city: "Berlin" },
]

/** A complete, clearly fake shop profile: the onboarded demo state. */
export function buildDemoProfile(now: Date): NewProfile {
  return {
    id: "shop",
    displayName: "Ceraghit Creation",
    legalName: "Ceraghit Creation (démo)",
    legalForm: "Personne physique",
    taxId: "0000000/A/M/000",
    registryNumber: "B0000000000",
    address: "14 rue des Potiers",
    postalCode: "8000",
    city: "Nabeul",
    country: "TN",
    phones: ["+216 20 000 000"],
    email: "atelier@example.com",
    notifyEmail: "commandes@example.com",
    bankHolder: "Ceraghit Creation",
    bankName: "Banque de démonstration",
    bankRib: "00000000000000000000",
    bankIban: "TN5900000000000000000000",
    bankBic: "DEMOTNTT",
    bankEurHolder: "Ceraghit Creation (démo)",
    bankEurName: "Demo Bank AG",
    bankEurIban: "DE89370400440532013000",
    bankEurBic: "DEMODEFF",
    bankEurAddress: "1 Demo Strasse, 10115 Berlin",
    invoiceNote: {
      fr: "TVA non applicable (démo).",
      en: "VAT not applicable (demo).",
      ar: "الضريبة على القيمة المضافة غير مطبقة (عرض تجريبي).",
    },
    shippingConfirmedAt: now,
    onboardedAt: now,
  }
}

export const DEMO_LOCATIONS: NewLocation[] = [
  {
    name: "Atelier Ceraghit Nabeul (démo)",
    description: {
      fr: "L'atelier où les pièces sont modelées, émaillées et cuites. Visite sur rendez-vous.",
      en: "The workshop where pieces are modelled, glazed and fired. Visits by appointment.",
      ar: "الورشة التي تُشكَّل فيها القطع وتُطلى وتُشوى. الزيارة بموعد مسبق.",
    },
    address: "Avenue Habib Bourguiba",
    city: "Nabeul",
    country: "Tunisie",
    image: "/catalogue/studio-interior.webp",
    mapUrl: "https://www.openstreetmap.org/search?query=Avenue%20Habib%20Bourguiba%2C%20Nabeul",
    phone: "+216 20 000 000",
    hours: {
      fr: "Du mardi au samedi, 10h à 18h",
      en: "Tuesday to Saturday, 10am to 6pm",
      ar: "من الثلاثاء إلى السبت، 10 صباحًا إلى 6 مساءً",
    },
    position: 0,
  },
  {
    name: "Galerie Ceraghit Bruxelles (démo)",
    description: {
      fr: "Une sélection de pièces à découvrir en Europe, présentée dans une galerie partenaire.",
      en: "A selection of pieces to discover in Europe, shown in a partner gallery.",
      ar: "مجموعة مختارة من القطع تُعرض في معرض شريك في أوروبا.",
    },
    address: "Rue Haute 120",
    city: "Bruxelles",
    country: "Belgique",
    mapUrl: "https://www.openstreetmap.org/search?query=Rue%20Haute%20120%2C%20Bruxelles",
    phone: "+32 470 00 00 00",
    hours: {
      fr: "Du mercredi au samedi, 11h à 19h",
      en: "Wednesday to Saturday, 11am to 7pm",
      ar: "من الأربعاء إلى السبت، 11 صباحًا إلى 7 مساءً",
    },
    position: 1,
  },
]

/** Demo-only copy by catalogue ref; the catalogue itself (real, seeded in production) stays untouched. 0011 and 0012 are fr only. */
export const DEMO_DESCRIPTIONS: Record<string, Localized> = {
  "0010": {
    fr: "Une assiette murale en terre cuite émaillée, modelée à la main. Chaque pièce garde les marques de l'atelier, aucune n'est tout à fait pareille.",
    en: "A glazed terracotta wall plate, modelled by hand. Each piece keeps the marks of the workshop, no two are quite alike.",
    ar: "طبق جداري من الطين المشوي المطلي، مشكّل يدويًا. تحتفظ كل قطعة بآثار الورشة، ولا تتطابق قطعتان تمامًا.",
  },
  "0011": {
    fr: "Une Curda Seca aux motifs géométriques, émaillée à la main puis cuite deux fois. Elle se pose sur une étagère ou s'accroche au mur.",
  },
  "0012": {
    fr: "Une Curda Seca aux teintes profondes, dessinée au trait avant l'émaillage. Les reflets changent selon la lumière de la pièce.",
  },
  "0013": {
    fr: "La Curda Seca de la collection, au décor inspiré des carreaux andalous. Elle s'accorde avec les teintes chaudes d'un intérieur méditerranéen.",
    en: "The collection's Curda Seca, with a pattern inspired by Andalusian tiles. It suits the warm tones of a Mediterranean interior.",
    ar: "كوردا سيكا المجموعة، بزخرفة مستوحاة من الزليج الأندلسي. تناسب ألوان البيوت المتوسطية الدافئة.",
  },
  "0200": {
    fr: "Une lampe votive en terre cuite émaillée, ajourée à la main. Posée avec une bougie, elle projette une lumière douce sur le mur.",
    en: "A glazed terracotta votive lamp, pierced by hand. With a candle inside, it casts a soft light on the wall.",
    ar: "مصباح نذري من الطين المشوي المطلي، مخرَّم يدويًا. مع شمعة بداخله يرسم ضوءًا هادئًا على الجدار.",
  },
  "0201": {
    fr: "Une lampe votive au décor floral, émaillée à la main. Elle existe aussi en terre cuite non émaillée.",
    en: "A votive lamp with a floral pattern, hand glazed. It also comes in unglazed terracotta.",
    ar: "مصباح نذري بزخرفة نباتية، مطلي يدويًا. يتوفر أيضًا من الطين المشوي غير المطلي.",
  },
  "0202": {
    fr: "Une lampe votive aux ajours fins, pensée pour une table de soirée. Le décor se découpe sur la flamme.",
    en: "A votive lamp with fine openings, made for an evening table. The pattern stands out against the flame.",
    ar: "مصباح نذري بفتحات دقيقة، صُنع لمائدة المساء. تتجلى الزخرفة أمام اللهب.",
  },
  "0050": {
    fr: "Méduse en bas-relief, modelée à la main dans la terre puis cuite. Le regard et les serpents sont repris à la main après la cuisson.",
    en: "Medusa in bas-relief, hand-modelled in clay then fired. The gaze and the snakes are reworked by hand after firing.",
    ar: "ميدوزا بنحت بارز، مشكّلة يدويًا من الطين ثم مشوية. تُعاد عينها وثعابينها يدويًا بعد الشي.",
  },
  "0051": {
    fr: "Amor Dominator, un bas-relief aux lignes tendues, modelé puis patiné à la main. Il se fixe au mur avec deux crochets.",
    en: "Amor Dominator, a bas-relief with taut lines, modelled then patinated by hand. It hangs on the wall with two hooks.",
    ar: "أمور المهيمن، نحت بارز بخطوط مشدودة، مشكّل ثم مصقول يدويًا. يُعلَّق على الجدار بخطافين.",
  },
  "0052": {
    fr: "Neptune triomphant sur son char, un bas-relief aux reliefs profonds. La patine claire met en valeur chaque détail.",
    en: "Triumphant Neptune on his chariot, a bas-relief with deep relief. The light patina shows off every detail.",
    ar: "نبتون المنتصر على عربته، نحت بارز بنتوءات عميقة. تُبرز الباتينا الفاتحة كل التفاصيل.",
  },
  "0600": {
    fr: "Un bas-relief en céramique à thème libre, réalisé selon vos envies. Le format et les teintes se choisissent avec l'atelier.",
    en: "A ceramic bas-relief on a theme of your choice, made to your wishes. The size and colours are chosen with the workshop.",
    ar: "نحت بارز من السيراميك بموضوع حر، يُنجز وفق رغبتك. يُحدَّد الحجم والألوان مع الورشة.",
  },
  "0700": {
    fr: "Le masque de Carthage, une pièce unique taillée à la main d'après les masques puniques. Il est numéroté et signé au dos.",
    en: "The Mask of Carthage, a one-off piece carved by hand after Punic masks. It is numbered and signed on the back.",
    ar: "قناع قرطاج، قطعة فريدة منحوتة يدويًا على غرار الأقنعة البونيقية. مرقَّمة وموقَّعة من الخلف.",
  },
  "0001": {
    fr: "Un haut-relief unique, modelé à la main pendant plusieurs semaines. Livré avec son système d'accroche.",
    en: "A unique high relief, hand-modelled over several weeks. Delivered with its hanging system.",
    ar: "نحت بارز عالٍ فريد، مشكّل يدويًا على مدى أسابيع. يُسلَّم مع نظام التعليق.",
  },
  "0004": {
    fr: "Une sculpture en ronde-bosse, pièce unique modelée dans la terre. Elle se regarde sous tous les angles.",
    en: "A sculpture in the round, a one-off piece modelled in clay. It is meant to be seen from every angle.",
    ar: "منحوتة مجسّمة، قطعة فريدة مشكّلة من الطين. تُرى من كل الزوايا.",
  },
}

/** Customer "create a unique piece" requests in every state, so the Demandes page has something in each filter. */
export function demoRequests(now: Date): (typeof customRequests.$inferInsert)[] {
  const ago = (days: number) => new Date(now.getTime() - days * 864e5)
  const base = { country: "FR", locale: "fr", images: [] as string[] }
  return [
    {
      ...base,
      name: "Élodie Marchand",
      email: "elodie.marchand@example.com",
      phone: "+33 6 00 00 00 01",
      description: "Un grand plat mural en haut-relief, thème marin, pour un salon.",
      dimensions: "60 x 40 cm",
      budget: "800 EUR",
      status: "new",
      createdAt: ago(1),
    },
    {
      ...base,
      name: "Hichem Zouari",
      email: "hichem.zouari@example.com",
      country: "TN",
      description: "Une série de six assiettes assorties pour un restaurant.",
      status: "new",
      createdAt: ago(2),
    },
    {
      ...base,
      name: "Sarah Janssens",
      email: "sarah.janssens@example.com",
      country: "BE",
      locale: "en",
      description: "A bas-relief of an olive tree for our entrance, about one metre wide.",
      dimensions: "100 x 60 cm",
      references: "https://example.com/inspiration",
      status: "contacted",
      adminNote: "Devis envoyé par mail, en attente de réponse.",
      createdAt: ago(6),
    },
    {
      ...base,
      name: "Karim Ayari",
      email: "karim.ayari@example.com",
      country: "TN",
      description: "Un masque inspiré de Carthage pour un cadeau d'entreprise.",
      budget: "500 DT",
      status: "done",
      adminNote: "Livré, client satisfait.",
      createdAt: ago(25),
    },
    {
      ...base,
      name: "Lucas Bernard",
      email: "lucas.bernard@example.com",
      description: "Une sculpture grandeur nature.",
      status: "declined",
      adminNote: "Hors des capacités de l'atelier.",
      createdAt: ago(18),
    },
  ]
}

/** Storefront stock states the videos film: a last piece, a sold out piece, and a sold out option on a piece with options. */
export const DEMO_STOCK_STATES = {
  last: { ref: "0015", stock: 1 },
  soldOut: { ref: "0210", stock: 0 },
  soldOutOption: { ref: "0209", stock: 0 },
} as const

/** Draft and archived pieces, so the product list passes its 40 row page and the status filters have rows. Refs 08xx, the journeys create 09xx. */
export function demoExtraProducts(categoryIds: string[]): (typeof products.$inferInsert)[] {
  const names = [
    "Coupelle d'essai",
    "Plat à gâteau",
    "Vase bouteille",
    "Applique murale",
    "Bougeoir double",
    "Tasse à thé",
    "Assiette creuse",
    "Photophore ajouré",
    "Cadre en relief",
    "Soliflore",
    "Petite jarre",
    "Pot à épices",
  ]
  return names.map((name, i) => ({
    ref: `08${String(i).padStart(2, "0")}`,
    slug: `demo-brouillon-${i}`,
    categoryId: categoryIds[i % categoryIds.length]!,
    title: { fr: name },
    priceTnd: (6 + i) * 10_000,
    priceEur: (18 + i * 3) * 100,
    stock: 3,
    status: i % 6 === 5 ? "archived" : "draft",
    position: 1000 + i,
  }))
}

/** Small deterministic generator, so the demo (and its test) always produce the same shop history. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** What the settings card shows on previews: one stale job, one whose latest run failed, one cut off, one healthy, one that never ran. */
export function demoJobRuns(now: Date): NewJobRun[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  const run = (name: string, minutes: number, rest: Partial<NewJobRun>): NewJobRun => ({
    name,
    startedAt: ago(minutes),
    finishedAt: ago(minutes - 1),
    ...rest,
  })
  return [
    run("cleanup-uploads", 30 * 60, { ok: true, counts: { rateLimits: 12, mailsPurged: 0, deleted: 3 } }),
    run("release-holds", 80, { ok: true, counts: { released: 1 } }),
    run("release-holds", 20, { ok: false, error: "Délai dépassé" }),
    { name: "track-shipments", startedAt: ago(150), finishedAt: null, ok: null },
    run("retry-mail", 8, { ok: true, counts: { sent: 2 } }),
  ]
}

/** About 45 orders over the last 60 days, ~70% in TND from Tunisia and ~30% in EUR from abroad. */
export function buildScenario(
  now: Date,
  products: ScenarioProduct[],
): {
  orders: NewOrder[]
  items: NewItem[]
  audit: NewAudit[]
  mail: NewMail[]
  jobRuns: NewJobRun[]
  shipments: NewShipment[]
} {
  const rand = rng(2027)
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!
  const out: {
    orders: NewOrder[]
    items: NewItem[]
    audit: NewAudit[]
    mail: NewMail[]
    jobRuns: NewJobRun[]
    shipments: NewShipment[]
  } = {
    orders: [],
    items: [],
    audit: [],
    mail: [],
    shipments: [],
    jobRuns: demoJobRuns(now),
  }

  let abroadCount = 0
  let seenLate = false
  for (let n = 0; n < 45; n++) {
    const id = crypto.randomUUID()
    const abroad = rand() < 0.3
    const place = abroad ? pick(ABROAD) : { country: "TN", city: pick(TN_CITIES) }
    const currency = abroad ? "EUR" : "TND"
    const createdAt = new Date(now.getTime() - rand() * 60 * 864e5)
    const roll = rand()
    const status =
      createdAt > new Date(now.getTime() - 3600e3)
        ? "pending_payment"
        : roll < 0.1
          ? "cancelled"
          : roll < 0.4
            ? "fulfilled"
            : "paid"
    const locale = abroad ? ORDER_LOCALES[abroadCount++ % ORDER_LOCALES.length]! : n % 9 === 5 ? "ar" : "fr"
    const streets = STREETS[place.city]!
    const pending = status === "pending_payment"
    const cod = !abroad && (pending || n % 4 === 0)
    const transfer = abroad && (pending || n % 3 === 0)
    const offline = cod || transfer
    const name = pick(PEOPLE)
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(products))
    const unique = [...new Map(lines.map((p) => [p.id, p])).values()]
    const unit = (p: ScenarioProduct) => (currency === "TND" ? p.priceTnd : p.priceEur)
    const subtotal = unique.reduce((sum, p) => sum + unit(p), 0)
    const paidAt = status === "paid" || status === "fulfilled" ? new Date(createdAt.getTime() + 5 * 60_000) : null
    out.orders.push({
      id,
      number: `CER-${10_000 + n}`,
      publicToken: `demo-${n}`,
      status,
      currency,
      subtotalMinor: subtotal,
      shippingMinor: 0,
      totalMinor: subtotal,
      customerName: name,
      email: `${name.split(" ")[0]!.toLowerCase()}.${n}@example.com`,
      phone: abroad ? "+32 470 00 00 00" : "+216 20 000 000",
      country: place.country,
      city: place.city,
      address: `${3 + ((n * 7) % 90)} ${streets[n % streets.length]}`,
      locale,
      paymentMethod: cod ? "cod" : transfer ? "transfer" : "online",
      paymentProvider: cod ? "cod" : transfer ? "transfer" : "demo",
      paymentRef: offline
        ? null
        : demoRef({
            outcome: status === "cancelled" ? "failed" : "paid",
            orderNumber: `CER-${10_000 + n}`,
            amountMinor: subtotal,
            currency,
            nonce: n.toString(16).padStart(32, "0"),
          }),
      paidAt,
      createdAt,
      ...(status === "fulfilled" && paidAt ? demoShipping(n, paidAt) : {}),
    })
    if (transfer && (status === "paid" || status === "fulfilled")) {
      out.audit.push({
        orderId: id,
        adminId: null,
        action: "mark_paid_manually",
        fromStatus: "pending_payment",
        toStatus: "paid",
        method: "transfer",
        note: "démo",
        createdAt: new Date(createdAt.getTime() + 5 * 60_000),
      })
    }
    if (!offline && status === "cancelled" && !seenLate) {
      seenLate = true
      out.audit.push({
        orderId: id,
        adminId: null,
        action: "late_payment",
        fromStatus: "cancelled",
        toStatus: "cancelled",
        note: "paiement reçu après l'annulation (démo)",
        createdAt: new Date(createdAt.getTime() + 50 * 60_000),
      })
    }
    for (const p of unique) {
      out.items.push({ orderId: id, productId: p.id, ref: p.ref, title: p.title, unitMinor: unit(p), quantity: 1 })
    }
  }
  // Unpaid transfer six days old: inside the default 7 day window, so the "Expire le" badge shows on previews.
  const waiting = products[0]!
  const waitingId = crypto.randomUUID()
  out.orders.push({
    id: waitingId,
    number: "CER-10099",
    publicToken: "demo-waiting",
    status: "pending_payment",
    currency: "EUR",
    subtotalMinor: waiting.priceEur,
    shippingMinor: 0,
    totalMinor: waiting.priceEur,
    customerName: "Claire Dubois",
    email: "claire.dubois.waiting@example.com",
    phone: "+32 470 00 00 00",
    country: "BE",
    city: "Bruxelles",
    address: "12 rue Haute",
    locale: "fr",
    paymentMethod: "transfer",
    paymentProvider: "transfer",
    paymentRef: null,
    paidAt: null,
    createdAt: new Date(now.getTime() - 6 * 864e5),
  })
  out.items.push({
    orderId: waitingId,
    productId: waiting.id,
    ref: waiting.ref,
    title: waiting.title,
    unitMinor: waiting.priceEur,
    quantity: 1,
  })
  // Payoneer orders: waiting for the link, link sent, confirmed by the owner, released after the hold.
  for (const [number, state] of [
    ["CER-10098", "waiting"],
    ["CER-10097", "paid"],
    ["CER-10096", "linked"],
    ["CER-10095", "expired"],
  ] as const) {
    const orderId = crypto.randomUUID()
    const paid = state === "paid"
    const paidAt = paid ? new Date(now.getTime() - 2 * 864e5) : null
    const createdAt = new Date(
      now.getTime() - (paid ? 3 : state === "expired" ? 9 : state === "linked" ? 2 : 1) * 864e5,
    )
    const link = state === "linked" ? "https://link.payoneer.com/pay/demo-cer-10096" : null
    out.orders.push({
      id: orderId,
      number,
      publicToken: `demo-${number}`,
      status: paid ? "paid" : state === "expired" ? "cancelled" : "pending_payment",
      currency: "EUR",
      subtotalMinor: waiting.priceEur,
      shippingMinor: 0,
      totalMinor: waiting.priceEur,
      customerName: paid ? "Hugo Martin" : "Inès Lambert",
      email: `payoneer.${number.toLowerCase()}@example.com`,
      phone: "+33 6 00 00 00 00",
      country: "FR",
      city: "Lyon",
      address: "8 rue de la République",
      locale: "fr",
      paymentMethod: "payoneer",
      paymentProvider: "payoneer",
      paymentRef: link,
      paidAt,
      createdAt,
    })
    out.items.push({
      orderId,
      productId: waiting.id,
      ref: waiting.ref,
      title: waiting.title,
      unitMinor: waiting.priceEur,
      quantity: 1,
    })
    if (paidAt) {
      out.audit.push({
        orderId,
        adminId: null,
        action: "mark_paid_manually",
        fromStatus: "pending_payment",
        toStatus: "paid",
        method: "payoneer",
        reference: "PAYONEER-DEMO-1",
        note: "démo",
        createdAt: paidAt,
      })
    }
    if (link) {
      out.audit.push({
        orderId,
        adminId: null,
        action: "payment_link_set",
        fromStatus: "pending_payment",
        toStatus: "pending_payment",
        method: "payoneer",
        reference: "link.payoneer.com/pay/demo-cer-10096",
        createdAt: new Date(now.getTime() - 864e5),
      })
    }
    if (state === "expired") {
      out.audit.push({
        orderId,
        adminId: null,
        action: "hold_expired",
        fromStatus: "pending_payment",
        toStatus: "cancelled",
        note: "délai de paiement dépassé (7 j)",
        createdAt: new Date(now.getTime() - 2 * 864e5),
      })
    }
  }
  addGatewayAlert(out, now, waiting)
  addCorrectableShipment(out, now, products[1] ?? waiting)
  addRefundedOrder(out, now, products[2] ?? waiting)
  addOlderHistory(out, now, products)
  out.shipments = demoShipments(out.orders, now)
  const confirmed = out.orders.filter((o) => o.status === "paid" || o.status === "fulfilled")
  const [sent, failed] = [confirmed[0], confirmed[1]]
  for (const [order, ok] of [
    [sent, true],
    [failed, false],
  ] as const) {
    if (!order) continue
    const subject = `Votre commande ${order.number} chez Ceraghit`
    const at = new Date(now.getTime() - (ok ? 3 : 2) * 3600e3)
    out.mail.push({
      kind: "order_confirmation",
      orderId: order.id,
      to: order.email,
      subject,
      text: `Bonjour ${order.customerName},\n\nMerci, nous avons bien reçu votre paiement.\n\nCeraghit Creation`,
      status: ok ? "sent" : "failed",
      providerId: ok ? "demo-mail" : null,
      error: ok ? null : "resend 503: service unavailable",
      attempts: ok ? 1 : 3,
      createdAt: at,
      sentAt: ok ? at : null,
    })
  }
  addMailFailures(out, now, confirmed.slice(2))
  return out
}

/** Seven more failed mails, one per kind but the first and one per error the failures page words in French. */
const MAIL_FAILURES: [kind: NewMail["kind"], error: string | null, attempts: number][] = [
  ["order_studio", "resend 403: domain is not verified", 3],
  ["request_studio", "resend 401: invalid api key", 1],
  ["payment_received", "resend 429: rate limit exceeded", 3],
  ["shipped", "resend 422: invalid to address", 1],
  ["order_expired", "network error: fetch failed", 3],
  ["payment_link", null, 1],
  ["test", "resend 400: bad request", 1],
]

function addMailFailures(out: Built, now: Date, orders: Built["orders"]): void {
  for (const [i, [kind, error, attempts]] of MAIL_FAILURES.entries()) {
    const order = orders[i]
    if (!order) continue
    const at = new Date(now.getTime() - (4 + i) * 3600e3)
    out.mail.push({
      kind,
      orderId: kind === "test" ? null : order.id,
      to: order.email,
      subject: `Message de démonstration ${order.number}`,
      text: `Bonjour ${order.customerName},\n\nMessage de démonstration.\n\nCeraghit Creation`,
      status: "failed",
      providerId: null,
      error,
      attempts,
      createdAt: at,
      sentAt: null,
    })
  }
}

type Built = ReturnType<typeof buildScenario>

/** Orders older than the 60 days above, so the default period keeps its numbers and the list passes its 200 row page. */
export const OLDER_ORDERS = 170

function addOlderHistory(out: Built, now: Date, products: ScenarioProduct[]): void {
  const rand = rng(3031)
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!
  for (let n = 0; n < OLDER_ORDERS; n++) {
    const id = crypto.randomUUID()
    const abroad = rand() < 0.3
    const place = abroad ? pick(ABROAD) : { country: "TN", city: pick(TN_CITIES) }
    const currency = abroad ? "EUR" : "TND"
    const createdAt = new Date(now.getTime() - (61 + rand() * 340) * 864e5)
    const roll = rand()
    const status = roll < 0.08 ? "cancelled" : roll < 0.4 ? "fulfilled" : "paid"
    const product = pick(products)
    const unit = currency === "TND" ? product.priceTnd : product.priceEur
    const number = `CER-${11_000 + n}`
    const name = pick(PEOPLE)
    const paidAt = status === "cancelled" ? null : new Date(createdAt.getTime() + 5 * 60_000)
    out.orders.push({
      id,
      number,
      publicToken: `demo-old-${n}`,
      status,
      currency,
      subtotalMinor: unit,
      shippingMinor: 0,
      totalMinor: unit,
      customerName: name,
      email: `${name.split(" ")[0]!.toLowerCase()}.old${n}@example.com`,
      phone: abroad ? "+32 470 00 00 00" : "+216 20 000 000",
      country: place.country,
      city: place.city,
      address: `${3 + ((n * 11) % 80)} ${STREETS[place.city]![n % STREETS[place.city]!.length]}`,
      locale: abroad ? ORDER_LOCALES[n % ORDER_LOCALES.length]! : "fr",
      paymentMethod: "online",
      paymentProvider: "demo",
      paymentRef: demoRef({
        outcome: status === "cancelled" ? "failed" : "paid",
        orderNumber: number,
        amountMinor: unit,
        currency,
        nonce: (1000 + n).toString(16).padStart(32, "0"),
      }),
      paidAt,
      createdAt,
      ...(status === "fulfilled" && paidAt
        ? { carrier: "other", carrierName: "Livraison en main propre", shippedAt: new Date(paidAt.getTime() + 864e5) }
        : {}),
    })
    out.items.push({
      orderId: id,
      productId: product.id,
      ref: product.ref,
      title: product.title,
      unitMinor: unit,
      quantity: 1,
    })
  }
}

/**
 * CER-10100: a payment the gateway reported with another amount (the order stayed pending, then the 45 minute hold
 * cancelled it). Shows the "Paiement en ligne incohérent" and the "Annulée automatiquement" lines of the history.
 */
function addGatewayAlert(out: Built, now: Date, product: ScenarioProduct): void {
  const id = crypto.randomUUID()
  const createdAt = new Date(now.getTime() - 3 * 864e5)
  out.orders.push({
    id,
    number: "CER-10100",
    publicToken: "demo-gateway-mismatch",
    status: "cancelled",
    currency: "EUR",
    subtotalMinor: product.priceEur,
    shippingMinor: 0,
    totalMinor: product.priceEur,
    customerName: "Nora Lefèvre",
    email: "nora.lefevre.mismatch@example.com",
    phone: "+33 6 00 00 00 00",
    country: "FR",
    city: "Lyon",
    address: "21 quai Saint-Antoine",
    locale: "fr",
    paymentMethod: "online",
    paymentProvider: "demo",
    paymentRef: demoRef({
      outcome: "failed",
      orderNumber: "CER-10100",
      amountMinor: product.priceEur,
      currency: "EUR",
      nonce: "a".padStart(32, "0"),
    }),
    paidAt: null,
    createdAt,
  })
  out.items.push({
    orderId: id,
    productId: product.id,
    ref: product.ref,
    title: product.title,
    unitMinor: product.priceEur,
    quantity: 1,
  })
  out.audit.push(
    {
      orderId: id,
      adminId: null,
      action: "gateway_mismatch",
      fromStatus: "pending_payment",
      toStatus: "pending_payment",
      note: `reçu ${Math.round(product.priceEur / 2)} EUR n° CER-10100, attendu ${product.priceEur} EUR n° CER-10100 (démo)`,
      createdAt: new Date(createdAt.getTime() + 10 * 60_000),
    },
    {
      orderId: id,
      adminId: null,
      action: "hold_expired",
      fromStatus: "pending_payment",
      toStatus: "cancelled",
      note: "délai de paiement dépassé (45 min)",
      createdAt: new Date(createdAt.getTime() + 45 * 60_000),
    },
  )
}

/** CER-10101: shipped with a Rapid-Poste number and no parcel card, so "Modifier le suivi" can be shown any time. */
function addCorrectableShipment(out: Built, now: Date, product: ScenarioProduct): void {
  const id = crypto.randomUUID()
  const paidAt = new Date(now.getTime() - 5 * 864e5)
  out.orders.push({
    id,
    number: "CER-10101",
    publicToken: "demo-correct-tracking",
    status: "fulfilled",
    currency: "TND",
    subtotalMinor: product.priceTnd,
    shippingMinor: 0,
    totalMinor: product.priceTnd,
    customerName: "Walid Chaabane",
    email: "walid.chaabane.tracking@example.com",
    phone: "+216 20 000 000",
    country: "TN",
    city: "Sousse",
    address: "5 rue Ibn Khaldoun",
    locale: "fr",
    paymentMethod: "online",
    paymentProvider: "demo",
    paymentRef: demoRef({
      outcome: "paid",
      orderNumber: "CER-10101",
      amountMinor: product.priceTnd,
      currency: "TND",
      nonce: "b".padStart(32, "0"),
    }),
    paidAt,
    createdAt: new Date(paidAt.getTime() - 5 * 60_000),
    carrier: "rapid-poste",
    trackingNumber: "RP900001TN",
    shippedAt: new Date(paidAt.getTime() + 6 * 3600e3),
  })
  out.items.push({
    orderId: id,
    productId: product.id,
    ref: product.ref,
    title: product.title,
    unitMinor: product.priceTnd,
    quantity: 1,
  })
}

/** CER-10102: a shipped order the owner refunded, so the customer page and the dashboard show the "Remboursée" state. */
function addRefundedOrder(out: Built, now: Date, product: ScenarioProduct): void {
  const id = crypto.randomUUID()
  const paidAt = new Date(now.getTime() - 9 * 864e5)
  out.orders.push({
    id,
    number: "CER-10102",
    publicToken: "demo-refunded",
    status: "refunded",
    currency: "TND",
    subtotalMinor: product.priceTnd,
    shippingMinor: 0,
    totalMinor: product.priceTnd,
    customerName: "Hela Mansouri",
    email: "hela.mansouri.refund@example.com",
    phone: "+216 20 000 000",
    country: "TN",
    city: "Monastir",
    address: "8 avenue Habib Bourguiba",
    locale: "fr",
    paymentMethod: "online",
    paymentProvider: "demo",
    paymentRef: demoRef({
      outcome: "paid",
      orderNumber: "CER-10102",
      amountMinor: product.priceTnd,
      currency: "TND",
      nonce: "c".padStart(32, "0"),
    }),
    paidAt,
    createdAt: new Date(paidAt.getTime() - 5 * 60_000),
  })
  out.items.push({
    orderId: id,
    productId: product.id,
    ref: product.ref,
    title: product.title,
    unitMinor: product.priceTnd,
    quantity: 1,
  })
  out.audit.push({
    orderId: id,
    adminId: null,
    action: "set_status",
    fromStatus: "paid",
    toStatus: "refunded",
    note: "remboursement (démo)",
    createdAt: new Date(paidAt.getTime() + 2 * 864e5),
  })
}

/** Fulfilled demo orders: ~60% Aramex with a waybill, ~25% Rapid-Poste with a number only, ~15% hand delivery. */
function demoShipping(n: number, paidAt: Date) {
  const shippedAt = new Date(paidAt.getTime() + (3 + ((n * 5) % 45)) * 3600e3)
  const k = n % 20
  if (k < 12) {
    const waybill = String(40_000_000_000 + n * 7_919)
    return {
      carrier: "aramex",
      trackingNumber: waybill,
      trackingUrl: `https://www.aramex.com/track/results?ShipmentNumber=${waybill}`,
      shippedAt,
    }
  }
  if (k < 17) return { carrier: "rapid-poste", trackingNumber: `RP${900_000 + n * 131}TN`, shippedAt }
  return { carrier: "other", carrierName: "Livraison en main propre", shippedAt }
}

const DEMO_FLOW = ["created", "in_transit", "out_for_delivery", "delivered"] as const
/** One in five demo parcels has a delivery incident: its events follow the flow up to in transit, then the problem. */
const DEMO_STATUSES = [...DEMO_FLOW, "exception"] as const

/**
 * One simulated Aramex shipment per fulfilled Aramex order, statuses spread over the flow. No label (the card says
 * so): a demo never stores a PDF. Tunisia is domestic, cash on delivery only in dinars for a Tunisian order.
 */
function demoShipments(orders: NewOrder[], now: Date): NewShipment[] {
  const live: NewShipment[] = orders
    .filter((o) => o.status === "fulfilled" && o.carrier === "aramex" && o.trackingNumber && o.id)
    .map((o, i) => {
      const status = DEMO_STATUSES[i % DEMO_STATUSES.length]!
      const at = (o.shippedAt as Date | null | undefined) ?? now
      const steps =
        status === "exception"
          ? [...DEMO_FLOW.slice(0, 2), "exception" as const]
          : DEMO_FLOW.slice(0, DEMO_FLOW.indexOf(status) + 1)
      const events = steps.map((code, step) => ({
        code: code.toUpperCase(),
        description: {
          created: "Envoi créé",
          in_transit: "En transit",
          out_for_delivery: "En cours de livraison",
          delivered: "Livré",
          exception: "Adresse incorrecte, le livreur rappelle le client",
        }[code],
        at: new Date(at.getTime() + step * 18 * 3600e3).toISOString(),
        location: "Tunis",
        comment: "démo",
        problemCode: code === "exception" ? "P10" : null,
      }))
      const country = o.country ?? "TN"
      return {
        orderId: o.id as string,
        provider: "aramex",
        environment: "fake",
        waybill: o.trackingNumber as string,
        productGroup: country === "TN" ? "DOM" : "EXP",
        productType: country === "TN" ? "ONP" : "PPX",
        status,
        codAmountMinor: o.paymentMethod === "cod" && country === "TN" && o.currency === "TND" ? o.totalMinor : null,
        currency: o.currency ?? "TND",
        weightGrams: 1500,
        pieces: 1,
        events,
        lastEvent: events.at(-1) ?? null,
        deliveredAt: status === "delivered" ? new Date(events.at(-1)!.at) : null,
        createdAt: at,
      }
    })
  // A parcel waiting for its pickup, and one cancelled before it left (its order went back to paid, the hold failed).
  const booked = live.find((s) => s.status === "created")
  if (booked) Object.assign(booked, { pickupId: "10000001", pickupGuid: "00000000-0000-4000-8000-000000000001" })
  // An international parcel whose commercial invoice could not be stored, to show the retry action.
  const abroad = live.find((s) => s.productGroup === "EXP" && s.status !== "created")
  if (abroad) {
    abroad.errors = [
      {
        at: now.toISOString(),
        code: "INVOICE",
        message: "La facture commerciale n'a pas pu être enregistrée. Utilisez « Réessayer la facture commerciale ».",
      },
    ]
  }
  const unshipped = orders.find((o) => o.status === "paid" && o.country === "TN" && !o.carrier && o.id)
  if (unshipped) {
    live.push({
      orderId: unshipped.id as string,
      provider: "aramex",
      environment: "fake",
      waybill: "FAKE-DEMO-CANCELLED",
      productGroup: "DOM",
      productType: "ONP",
      status: "cancelled",
      currency: unshipped.currency ?? "TND",
      weightGrams: 1500,
      pieces: 1,
      errors: [
        {
          at: now.toISOString(),
          code: "HOLD",
          message: "Aramex n'a pas confirmé la mise en attente : appelez votre agence pour annuler ce colis.",
        },
      ],
      createdAt: now,
    })
  }
  return live
}
