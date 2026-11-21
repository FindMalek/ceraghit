import type { Device } from "./steps"

const FLAGS = new Set(["zoom", "burn", "plan"])

export type VoiceMode = "draft" | "final"

export interface Args {
  flags: Set<string>
  /** Narration: `draft` is the free macOS voice, `final` is ElevenLabs (paid). Bare `--voice` means draft. */
  voice?: VoiceMode
  device?: Device
  ids: string[]
}

export function parseArgs(argv: string[]): Args {
  const flags = new Set<string>()
  const ids: string[] = []
  let device: Device | undefined
  let voice: VoiceMode | undefined
  for (const arg of argv.filter((a) => a !== "--")) {
    if (arg.startsWith("--device=")) {
      const value = arg.slice("--device=".length)
      if (value !== "desktop" && value !== "mobile")
        throw new Error(`--device must be desktop or mobile, got "${value}"`)
      device = value
    } else if (arg === "--voice") {
      voice = "draft"
    } else if (arg.startsWith("--voice=")) {
      const value = arg.slice("--voice=".length)
      if (value !== "draft" && value !== "final") throw new Error(`--voice must be draft or final, got "${value}"`)
      voice = value
    } else if (arg.startsWith("--")) {
      if (!FLAGS.has(arg.slice(2)))
        throw new Error(
          `unknown option ${arg}: use --voice[=draft|final], --plan, --zoom, --burn or --device=desktop|mobile`,
        )
      flags.add(arg.slice(2))
    } else if (/^\d{2}$/.test(arg)) ids.push(arg)
    else throw new Error(`unexpected argument "${arg}": video ids are two digits, like 03`)
  }
  return { flags, voice, device, ids }
}
