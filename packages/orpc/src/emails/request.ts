import type { Mail } from "../lib/mailer"

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

export function renderStudioRequest(request: StudioRequest, studio: string): Mail {
  return {
    to: studio,
    replyTo: request.email,
    subject: `Nouvelle demande de pièce unique : ${request.name}`,
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
