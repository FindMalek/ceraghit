export interface CaughtMail {
  subject: string
  text: string
  to: string[]
}

interface MailpitUrl {
  base: string
  headers: Record<string, string>
}

function target(): MailpitUrl {
  const url = new URL(process.env.MAILPIT_URL ?? "http://localhost:8025")
  const headers: Record<string, string> = {}
  if (url.username) {
    headers.authorization = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}`
    url.username = ""
    url.password = ""
  }
  return { base: url.toString().replace(/\/$/, ""), headers }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { base, headers } = target()
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) throw new Error(`mailpit ${path} ${res.status}`)
  return (await res.json()) as T
}

async function waitForMail(query: string, timeoutMs: number): Promise<CaughtMail> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const found = await call<{ messages: { ID: string }[] }>(
      `/api/v1/search?query=${encodeURIComponent(query)}&limit=1`,
    )
    const id = found.messages[0]?.ID
    if (id) {
      const mail = await call<{ Subject: string; Text: string; To: { Address: string }[] }>(`/api/v1/message/${id}`)
      return { subject: mail.Subject, text: mail.Text, to: mail.To.map((a) => a.Address) }
    }
    if (Date.now() > deadline) throw new Error(`no mail for ${query}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** Newest mail sent to an address. Outside production every mail goes to MAIL_REDIRECT_TO, so use mailWithSubject. */
export function latestMailTo(address: string, timeoutMs = 10_000): Promise<CaughtMail> {
  return waitForMail(`to:"${address}"`, timeoutMs)
}

/** Newest mail whose subject contains the text, e.g. an order number. Works when every mail is redirected. */
export function mailWithSubject(subject: string, timeoutMs = 10_000): Promise<CaughtMail> {
  return waitForMail(`subject:"${subject}"`, timeoutMs)
}

export async function clearMails(): Promise<void> {
  await call("/api/v1/messages", { method: "DELETE" })
}
