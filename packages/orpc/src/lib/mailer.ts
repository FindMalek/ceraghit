export interface Mail {
  to: string
  subject: string
  text: string
  replyTo?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Local without a mail catcher: nothing leaves the machine, the whole mail is logged. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    const body = mail.text
      .split("\n")
      .map((line) => (line ? `  ${line}` : line))
      .join("\n")
    console.info(`[mail] to ${mail.to}: ${mail.subject}\n${body}`)
  }
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

  async send({ to, subject, text, replyTo }: Mail) {
    const res = await this.http(`${this.baseUrl.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: parseAddress(this.from),
        To: [{ Email: to }],
        ReplyTo: replyTo ? [{ Email: replyTo }] : undefined,
        Subject: subject,
        Text: text,
      }),
    })
    if (!res.ok) throw new Error(`mailpit ${res.status}: ${await res.text().catch(() => "")}`)
  }
}

export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private http: typeof fetch = fetch,
  ) {}

  async send({ to, subject, text, replyTo }: Mail) {
    const res = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to, subject, text, reply_to: replyTo }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text().catch(() => "")}`)
  }
}

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

  async send({ to, subject, text, replyTo }: Mail) {
    const header = [`Destinataire d'origine : ${to}`, ...(replyTo ? [`Répondre à : ${replyTo}`] : [])]
    await this.inner.send({
      to: this.redirectTo,
      subject: `[${this.label} → ${to}] ${subject}`,
      text: `${header.join("\n")}\n\n${text}`,
    })
  }
}
