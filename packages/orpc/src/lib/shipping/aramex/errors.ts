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

/** Secrets shorter than this would blank out ordinary words, so they are not masked. */
const MIN_SECRET = 4

export function redact(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET) continue
    for (const form of new Set([secret, encodeURIComponent(secret)])) out = out.split(form).join("***")
  }
  return out
}

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
    const notifications = (init.notifications ?? []).map((n) => ({
      code: redact(n.code, init.secrets ?? []),
      message: redact(n.message, init.secrets ?? []),
    }))
    super(AramexError.describe(init.code, notifications))
    this.name = "AramexError"
    this.code = init.code
    this.notifications = notifications
    this.retriable = init.retriable ?? false
    this.httpStatus = init.httpStatus ?? null
  }

  get guestMessage(): string {
    return GUEST_MESSAGE
  }

  private static describe(code: string, notifications: AramexNotification[]): string {
    if (KNOWN[code]) return KNOWN[code]
    if (code === "BAD_RESPONSE") return BAD_RESPONSE
    if (code === "UNREACHABLE" || code === "TIMEOUT") return UNREACHABLE
    const text = notifications
      .map((n) => n.message)
      .join(" ")
      .trim()
    return text ? `Aramex a refusé la demande : ${text}` : "Aramex a refusé la demande."
  }
}
