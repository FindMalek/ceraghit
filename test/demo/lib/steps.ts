import { z } from "zod"

const target = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  testId: z.string().optional(),
  /** Which visible match to use, from 0; -1 is the last. For twins like the two Annuler buttons of a confirmation. */
  nth: z.number().int().optional(),
})

export const ACTIONS = [
  "goto",
  "click",
  "tap",
  "fill",
  "type",
  "select",
  "upload",
  "hover",
  "scroll",
  "press",
  "wait",
  "drag",
] as const

const step = z.object({
  action: z.enum(ACTIONS),
  target: target.optional(),
  /** Text to type, option, path under test/demo/assets, key, scroll distance or a path for goto. `{{NAME}}` reads the environment. */
  value: z.string().optional(),
  to: target.optional(),
  caption_fr: z.string().min(1),
  caption_ar: z.string().optional(),
  holdMs: z.number().int().min(0).optional(),
  only: z.enum(["desktop", "mobile"]).optional(),
  /** A device-only step is captioned but silent; `voice: true` makes it speak (and pay for) its own line. */
  voice: z.boolean().optional(),
})

export const videoSchema = z.object({
  id: z.string().regex(/^\d{2}$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title_fr: z.string().min(1),
  /** Devices the video is recorded on; both when absent. */
  devices: z
    .array(z.enum(["desktop", "mobile"]))
    .min(1)
    .optional(),
  start: z.object({
    app: z.enum(["web", "dashboard"]),
    path: z.string().startsWith("/"),
    loggedIn: z.boolean(),
  }),
  steps: z.array(step).min(1),
})

export type Step = z.infer<typeof step>
export type Target = z.infer<typeof target>
export type Video = z.infer<typeof videoSchema>
export type Device = "desktop" | "mobile"

export function parseVideo(json: unknown): Video {
  return videoSchema.parse(json)
}

export function stepsFor(video: Video, device: Device): Step[] {
  return video.steps.filter((s) => !s.only || s.only === device)
}

export function fileBase(video: Video, device: Device): string {
  return `${video.id}-${video.slug}-${device}`
}
