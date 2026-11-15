export interface Mail {
  to: string
  subject: string
  text: string
  replyTo?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Local and preview: nothing leaves the machine, the mail is only logged. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    console.info(`[mail] to ${mail.to}: ${mail.subject}`)
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
