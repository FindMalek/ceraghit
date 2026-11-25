import { expect, test } from "bun:test"
import {
  foldText,
  formatTutorialLength,
  parseTutorialManifest,
  playableSources,
  readTutorialLinks,
  relatedTutorials,
  searchTutorials,
  TUTORIALS,
  tutorialSchema,
  tutorialTags,
  youtubeId,
} from "../src/tutorials"

test("a pasted youtube link becomes the bare video id, anything else is refused", () => {
  for (const pasted of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s",
    "youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    " dQw4w9WgXcQ ",
  ])
    expect(youtubeId(pasted)).toBe("dQw4w9WgXcQ")
  expect(youtubeId("https://vimeo.com/watch?v=dQw4w9WgXcQ")).toBeNull()
  expect(youtubeId("https://youtu.be/dQw4w9WgXc")).toBeNull()
})

test("the catalogue is valid: unique ids, slugs matching ids, lengths within 30 to 150 s, known devices", () => {
  const parsed = TUTORIALS.map((t) => tutorialSchema.safeParse(t))
  expect(parsed.filter((p) => !p.success).map((p) => p.error?.issues[0]?.path.join("."))).toEqual([])
  expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(TUTORIALS.length)
  expect(TUTORIALS.length).toBe(98)
  for (const t of TUTORIALS) expect(t.id).toBe(`${t.id.slice(0, 2)}-${t.slug}`)
  expect(TUTORIALS.filter((t) => t.status === "soon").map((t) => t.id.slice(0, 2))).toEqual(["68", "77"])
})

test("the schema refuses a bad tag, a length out of range and an unknown device", () => {
  const ok = TUTORIALS[0]!
  for (const bad of [
    { ...ok, tags: ["Accueil"] },
    { ...ok, tags: [" accueil"] },
    { ...ok, lengthSeconds: 20 },
    { ...ok, lengthSeconds: 151 },
    { ...ok, devices: ["tablet"] },
    { ...ok, id: "1-accueil" },
  ])
    expect(tutorialSchema.safeParse(bad).success).toBe(false)
})

test("search ignores case and accents and needs every word", () => {
  const ids = (query: string) => searchTutorials(TUTORIALS, { query }).map((t) => t.id)
  expect(ids("RECHERCHER piece")).toContain("07-rechercher-produit")
  expect(ids("émaillée")).toEqual(ids("EMAILLEE"))
  expect(ids("émaillée").length).toBeGreaterThan(0)
  expect(ids("virement iban")).toContain("26-commander-virement-etranger")
  expect(ids("virement zzzzzz")).toEqual([])
})

test("search matches a tag that is in neither the title nor the description", () => {
  const tagOnly = TUTORIALS.find((t) =>
    t.tags.some((tag) => !foldText(`${t.title} ${t.description}`).includes(foldText(tag))),
  )!
  const tag = tagOnly.tags.find((x) => !foldText(`${tagOnly.title} ${tagOnly.description}`).includes(foldText(x)))!
  expect(searchTutorials(TUTORIALS, { query: tag }).map((t) => t.id)).toContain(tagOnly.id)
})

test("an empty query keeps everything and the filters narrow it", () => {
  expect(searchTutorials(TUTORIALS, { query: "  " })).toHaveLength(TUTORIALS.length)
  const emails = searchTutorials(TUTORIALS, { area: "emails" })
  expect(emails.length).toBeGreaterThan(0)
  expect(emails.every((t) => t.area === "emails")).toBe(true)
  const visitors = searchTutorials(TUTORIALS, { audience: "visitor", query: "panier" })
  expect(visitors.length).toBeGreaterThan(0)
  expect(visitors.every((t) => t.audience.includes("visitor"))).toBe(true)
})

test("related videos share tags, never include the video itself", () => {
  const cart = TUTORIALS.find((t) => t.id === "13-ajouter-au-panier")!
  const related = relatedTutorials(cart, TUTORIALS)
  expect(related.length).toBeGreaterThan(0)
  expect(related.map((t) => t.id)).not.toContain(cart.id)
  for (const t of related) expect(t.tags.some((tag) => cart.tags.includes(tag))).toBe(true)
})

test("the manifest parser keeps good entries and falls back to no videos on anything else", () => {
  const good = { desktop: true, mobile: false, captions: true, poster: true }
  const text = JSON.stringify({
    videos: {
      "07-rechercher-produit": good,
      "08-trier-produits": { desktop: "yes" },
      "99-inconnu": good,
      "09-fiche-produit-galerie": { captions: true },
    },
  })
  expect(parseTutorialManifest(text)).toEqual({ videos: { "07-rechercher-produit": good } })
  for (const bad of [null, undefined, "", "{not json", "[]", "null", '{"videos":[]}', '{"videos":"x"}'])
    expect(parseTutorialManifest(bad)).toEqual({ videos: {} })
})

test("links saved under the old slots move to the video that replaced them, junk is dropped", () => {
  const link = { desktop: "dQw4w9WgXcQ", mobile: null }
  expect(
    readTutorialLinks({
      "02": link,
      "05-supprimer-produit": link,
      "59-supprimer-produit": link,
      "12-demander-un-devis": { desktop: null, mobile: null },
      zzz: link,
    }),
  ).toEqual({ "23-commander-especes-tunisie": link, "59-supprimer-produit": link })
  expect(readTutorialLinks("nope")).toEqual({})
})

test("the formatted length reads in minutes and seconds", () => {
  expect(formatTutorialLength(45)).toBe("45 s")
  expect(formatTutorialLength(90)).toBe("1 min 30")
  expect(formatTutorialLength(120)).toBe("2 min")
})

test("a video plays from the owner's link first, then the hosted file, on its declared devices only", () => {
  const byId = (id: string) => TUTORIALS.find((t) => t.id === id)!
  const both = byId("07-rechercher-produit")
  const desktopOnly = byId("97-demo-test-production")
  const files = { desktop: true, mobile: true, captions: true, poster: true }
  expect(playableSources(both, files, undefined)).toEqual({ desktop: { kind: "file" }, mobile: { kind: "file" } })
  expect(playableSources(both, files, { desktop: "dQw4w9WgXcQ", mobile: null })).toEqual({
    desktop: { kind: "youtube", id: "dQw4w9WgXcQ" },
    mobile: { kind: "file" },
  })
  expect(playableSources(desktopOnly, files, { desktop: null, mobile: "dQw4w9WgXcQ" })).toEqual({
    desktop: { kind: "file" },
  })
  expect(playableSources(desktopOnly, undefined, { desktop: null, mobile: "dQw4w9WgXcQ" })).toEqual({})
  expect(playableSources(both, undefined, undefined)).toEqual({})
})

test("a video marked soon never plays, even with files or links", () => {
  const soon = TUTORIALS.find((t) => t.status === "soon")!
  const files = { desktop: true, mobile: true, captions: true, poster: true }
  expect(playableSources(soon, files, { desktop: "dQw4w9WgXcQ", mobile: null })).toEqual({})
})

test("the tag filter matches the tag itself, not the words of the description", () => {
  const tag = "panier"
  const byTag = searchTutorials(TUTORIALS, { tag })
  expect(byTag.length).toBeGreaterThan(0)
  expect(byTag.every((t) => t.tags.some((x) => foldText(x) === tag))).toBe(true)
  expect(byTag.length).toBeLessThan(searchTutorials(TUTORIALS, { query: tag }).length)
  expect(tutorialTags(TUTORIALS)).toContain(tag)
})
