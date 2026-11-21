import {
  TUTORIAL_AREAS,
  TUTORIAL_AUDIENCES,
  TUTORIAL_IDS,
  TUTORIALS,
  type TutorialArea,
  type TutorialAudience,
  tutorialTags,
} from "@workspace/sdk"

export interface TutorialQuery {
  q: string
  area: TutorialArea | null
  audience: TutorialAudience | null
  tag: string | null
  video: string | null
}

export const EMPTY_TUTORIAL_QUERY: TutorialQuery = { q: "", area: null, audience: null, tag: null, video: null }

const TAGS = tutorialTags(TUTORIALS)

const pick = <T extends string>(all: readonly T[], value: string | null): T | null =>
  all.find((item) => item === value) ?? null

/** `/help?q=panier&area=checkout&video=13-ajouter-au-panier`: junk values are ignored, never an error. */
export function parseTutorialQuery(params: URLSearchParams): TutorialQuery {
  const video = params.get("video")
  return {
    q: (params.get("q") ?? "").trim(),
    area: pick(TUTORIAL_AREAS, params.get("area")),
    audience: pick(TUTORIAL_AUDIENCES, params.get("audience")),
    tag: pick(TAGS, params.get("tag")),
    video: video && TUTORIAL_IDS.has(video) ? video : null,
  }
}

export function toTutorialSearchParams(query: TutorialQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q.trim()) params.set("q", query.q.trim())
  if (query.area) params.set("area", query.area)
  if (query.audience) params.set("audience", query.audience)
  if (query.tag) params.set("tag", query.tag)
  if (query.video) params.set("video", query.video)
  return params
}
