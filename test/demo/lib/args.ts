import type { Device } from "./steps"

const FLAGS = new Set(["voice", "zoom", "burn"])

export interface Args {
  flags: Set<string>
  device?: Device
  ids: string[]
}

export function parseArgs(argv: string[]): Args {
  const flags = new Set<string>()
  const ids: string[] = []
  let device: Device | undefined
  for (const arg of argv.filter((a) => a !== "--")) {
    if (arg.startsWith("--device=")) {
      const value = arg.slice("--device=".length)
      if (value !== "desktop" && value !== "mobile")
        throw new Error(`--device must be desktop or mobile, got "${value}"`)
      device = value
    } else if (arg.startsWith("--")) {
      if (!FLAGS.has(arg.slice(2)))
        throw new Error(`unknown option ${arg}: use --voice, --zoom, --burn or --device=desktop|mobile`)
      flags.add(arg.slice(2))
    } else if (/^\d{2}$/.test(arg)) ids.push(arg)
    else throw new Error(`unexpected argument "${arg}": video ids are two digits, like 03`)
  }
  return { flags, device, ids }
}
