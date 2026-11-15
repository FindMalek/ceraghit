import type { Mail } from "../lib/mailer"
import { requestHtml } from "./templates"

export interface StudioRequest {
  name: string
  email: string
  phone?: string | null
  country?: string | null
  description: string
  dimensions?: string | null
  budget?: string | null
  references?: string | null
  images: unknown[]
}

export async function renderStudioRequest(request: StudioRequest, studio: string, webUrl: string): Promise<Mail> {
  return {
    to: studio,
    replyTo: request.email,
    subject: `Nouvelle demande de pièce unique : ${request.name}`,
    html: await requestHtml(request, webUrl, studio),
    text: [
      `${request.name} <${request.email}>${request.phone ? ` ${request.phone}` : ""}${request.country ? ` (${request.country})` : ""}`,
      "",
      request.description,
      "",
      ...(request.dimensions ? [`Dimensions : ${request.dimensions}`] : []),
      ...(request.budget ? [`Budget : ${request.budget}`] : []),
      ...(request.references ? [`Références : ${request.references}`] : []),
      ...(request.images.length ? [`${request.images.length} photo(s) à voir dans le dashboard.`] : []),
      "",
      "Répondez directement à cet email pour écrire au client.",
    ].join("\n"),
  }
}
