export interface Caption {
  startMs: number
  endMs: number
  text: string
}

const MAX_LINE = 42

/** Greedy wrap at 42 characters, two lines at most (the rest stays on the second line). */
export function wrap(text: string): string {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if (line && `${line} ${word}`.length > MAX_LINE && lines.length < 1) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  lines.push(line)
  return lines.join("\n")
}

function stamp(ms: number, sep: "," | "."): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(total % 1000, 3)}`
}

export function toSrt(captions: Caption[]): string {
  return `${captions
    .map((c, i) => `${i + 1}\n${stamp(c.startMs, ",")} --> ${stamp(c.endMs, ",")}\n${wrap(c.text)}`)
    .join("\n\n")}\n`
}

export function toVtt(captions: Caption[]): string {
  const cues = captions.map((c) => `${stamp(c.startMs, ".")} --> ${stamp(c.endMs, ".")}\n${wrap(c.text)}`)
  return `WEBVTT\n\n${cues.join("\n\n")}\n`
}
