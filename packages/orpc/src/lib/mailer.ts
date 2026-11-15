import { mailColors } from "../emails/brand"

export interface Mail {
  to: string
  subject: string
  text: string
  /** Optional rich version sent beside `text`; the text part is always complete on its own. */
  html?: string
  replyTo?: string
  /** Same value across the retries of one mail, so a retry after an accepted send cannot deliver twice. */
  idempotencyKey?: string
}

export interface Mailer {
  /** The provider's id for the mail when it gives one. */
  send(mail: Mail): Promise<{ id: string | null } | undefined>
}

/** `transient` errors (network, 429, 5xx) are worth retrying, the others (bad key, unverified domain, invalid mail) are not. */
export class MailError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status: number,
    /** Milliseconds the provider asked us to wait. */
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = "MailError"
  }
}

/** Local without a mail catcher: nothing leaves the machine, the whole mail is logged. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    const body = mail.text
      .split("\n")
      .map((line) => (line ? `  ${line}` : line))
      .join("\n")
    console.info(`[mail] to ${mail.to}: ${mail.subject}\n${body}`)
    return { id: null }
  }
}

async function bodyOf(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 300)
}

/** "Name <addr>" or a bare address. */
export function parseAddress(value: string): { Email: string; Name?: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (!match?.[2]) return { Email: value.trim() }
  const name = match[1]?.trim()
  return name ? { Email: match[2].trim(), Name: name } : { Email: match[2].trim() }
}

/** Local and previews: Mailpit keeps every mail so its body can be read in the UI or through its api. */
export class MailpitMailer implements Mailer {
  constructor(
    private baseUrl: string,
    private from: string,
    private http: typeof fetch = fetch,
  ) {}

  async send({ to, subject, text, html, replyTo }: Mail) {
    const res = await this.http(`${this.baseUrl.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: parseAddress(this.from),
        To: [{ Email: to }],
        ReplyTo: replyTo ? [{ Email: replyTo }] : undefined,
        Subject: subject,
        Text: text,
        HTML: html,
      }),
    })
    if (!res.ok) throw new MailError(`mailpit ${res.status}: ${await bodyOf(res)}`, res.status >= 500, res.status)
    return { id: null }
  }
}

const RESEND_TIMEOUT_MS = 4000

export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private http: typeof fetch = fetch,
  ) {}

  async send({ to, subject, text, html, replyTo, idempotencyKey }: Mail) {
    let res: Response
    try {
      res = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: this.from, to, subject, text, html, reply_to: replyTo }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      })
    } catch {
      throw new MailError("resend: network error", true, 0)
    }
    if (!res.ok) {
      const seconds = Number(res.headers.get("retry-after"))
      throw new MailError(
        `resend ${res.status}: ${await bodyOf(res)}`,
        res.status === 429 || res.status >= 500,
        res.status,
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
      )
    }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null
    return { id: typeof body?.id === "string" ? body.id : null }
  }
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Outside production every mail goes to one inbox. replyTo is dropped so a reply from that inbox never reaches a real
 * customer; the original recipient and replyTo are shown in the subject and body instead.
 */
export class RedirectMailer implements Mailer {
  constructor(
    private inner: Mailer,
    private redirectTo: string,
    private label: string,
  ) {}

  async send({ to, subject, text, html, replyTo, idempotencyKey }: Mail) {
    const header = [`Destinataire d'origine : ${to}`, ...(replyTo ? [`Répondre à : ${replyTo}`] : [])]
    return this.inner.send({
      to: this.redirectTo,
      subject: `[${this.label} → ${to}] ${subject}`,
      text: `${header.join("\n")}\n\n${text}`,
      ...(html
        ? {
            html: html.replace(
              /<body[^>]*>/,
              (open) => `${open}<p style="color:${mailColors.goldBright}">${header.map(escapeHtml).join("<br>")}</p>`,
            ),
          }
        : {}),
      idempotencyKey,
    })
  }
}
