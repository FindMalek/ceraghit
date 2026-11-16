export interface AramexNotification {
  code: string
  message: string
}

/** Shown to a visitor: never anything the provider said. */
export const GUEST_MESSAGE = "Le transport est momentanément indisponible. Réessayez plus tard."

const KNOWN: Record<string, string> = {
  ERR75: "Identifiants Aramex refusés (nom d'utilisateur, mot de passe, numéro de compte ou PIN).",
}
const BAD_RESPONSE = "Réponse inattendue d'Aramex. Réessayez dans un instant."
const UNREACHABLE = "Aramex ne répond pas. Réessayez dans un instant."

/** Owner-facing. `message` never holds the request body or a credential. */
export class AramexError extends Error {
  readonly code: string
  readonly notifications: AramexNotification[]
  readonly retriable: boolean
  readonly httpStatus: number | null

  constructor(init: {
    code: string
    notifications?: AramexNotification[]
    retriable?: boolean
    httpStatus?: number | null
    secrets?: string[]
  }) {
    const notifications = init.notifications ?? []
    super(AramexError.describe(init.code, notifications, init.secrets ?? []))
    this.name = "AramexError"
    this.code = init.code
    this.notifications = notifications
    this.retriable = init.retriable ?? false
    this.httpStatus = init.httpStatus ?? null
  }

  get guestMessage(): string {
    return GUEST_MESSAGE
  }

  private static describe(code: string, notifications: AramexNotification[], secrets: string[]): string {
    if (KNOWN[code]) return KNOWN[code]
    if (code === "BAD_RESPONSE") return BAD_RESPONSE
    if (code === "UNREACHABLE" || code === "TIMEOUT") return UNREACHABLE
    let text = notifications
      .map((n) => n.message)
      .join(" ")
      .trim()
    for (const secret of secrets) if (secret) text = text.split(secret).join("***")
    return text ? `Aramex a refusé la demande : ${text}` : "Aramex a refusé la demande."
  }
}
