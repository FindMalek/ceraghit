import { E2E } from "../env"

const base = E2E.stubUrl

export type GroqMode = "ok" | "rate_limit" | "down" | "malformed" | "too_long" | "hang"

export async function setGroqMode(mode: GroqMode): Promise<void> {
  await fetch(`${base}/__groq/mode`, { method: "POST", body: JSON.stringify({ mode }) })
}

export async function groqRequests(): Promise<{ model: string; targets: string[]; auth: boolean }[]> {
  return (await fetch(`${base}/__groq/requests`)).json() as Promise<
    { model: string; targets: string[]; auth: boolean }[]
  >
}
