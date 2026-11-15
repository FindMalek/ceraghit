import { z } from "zod"

export const TUTORIALS = [
  { id: "01", slug: "accueil", title: "Découvrir la boutique", minutes: 1.5 },
  { id: "02", slug: "commande", title: "Passer une commande", minutes: 2.5 },
  { id: "03", slug: "connexion", title: "Se connecter", minutes: 0.75 },
  { id: "04", slug: "ajouter-produit", title: "Ajouter un produit", minutes: 2 },
  { id: "05", slug: "supprimer-produit", title: "Supprimer un produit", minutes: 0.8 },
  { id: "06", slug: "ajouter-images", title: "Ajouter des photos", minutes: 1.25 },
  { id: "07", slug: "supprimer-images", title: "Supprimer des photos", minutes: 0.75 },
  { id: "08", slug: "modifier-description", title: "Modifier une description", minutes: 1 },
  { id: "09", slug: "statistiques", title: "Lire les statistiques", minutes: 1.25 },
  { id: "10", slug: "facture", title: "Imprimer une facture", minutes: 1 },
  { id: "11", slug: "premiere-ouverture", title: "Première ouverture", minutes: 3 },
] as const

export type Tutorial = (typeof TUTORIALS)[number]
export type TutorialId = Tutorial["id"]

export const TUTORIAL_IDS = TUTORIALS.map((t) => t.id) as [TutorialId, ...TutorialId[]]

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"])

export const youtubeIdSchema = z.string().regex(VIDEO_ID)

export const tutorialLinkSchema = z.object({ desktop: youtubeIdSchema.nullable(), mobile: youtubeIdSchema.nullable() })
export const tutorialLinksSchema = z.record(z.enum(TUTORIAL_IDS), tutorialLinkSchema)
export type TutorialLink = z.infer<typeof tutorialLinkSchema>
export type TutorialLinks = z.infer<typeof tutorialLinksSchema>

export const EMPTY_TUTORIAL_LINKS = Object.fromEntries(
  TUTORIAL_IDS.map((id) => [id, { desktop: null, mobile: null }]),
) as TutorialLinks

/** The 11-character video id from anything the owner pastes: a share link, a watch/shorts/embed url or the id itself. */
export function youtubeId(input: string): string | null {
  const text = input.trim()
  if (VIDEO_ID.test(text)) return text
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const [first, second] = url.pathname.split("/").filter(Boolean)
  let id: string | null | undefined = null
  if (host === "youtu.be") id = first
  else if (YOUTUBE_HOSTS.has(host)) {
    if (first === "watch") id = url.searchParams.get("v")
    else if (first === "shorts" || first === "embed" || first === "live") id = second
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/** "1 min 30", "45 s": how long a tutorial lasts, for people, not for players. */
export function formatTutorialLength(minutes: number): string {
  const total = Math.round(minutes * 60)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (!m) return `${s} s`
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`
}
