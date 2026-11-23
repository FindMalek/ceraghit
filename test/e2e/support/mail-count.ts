/** How many mails in the e2e Mailpit carry this text in their subject (an order number is unique, so it is exact). */
export async function countMailsWithSubject(subject: string): Promise<number> {
  const base = process.env.MAILPIT_URL ?? "http://localhost:8025"
  const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}&limit=50`)
  if (!res.ok) throw new Error(`mailpit search ${res.status}`)
  return ((await res.json()) as { messages: unknown[] }).messages.length
}
