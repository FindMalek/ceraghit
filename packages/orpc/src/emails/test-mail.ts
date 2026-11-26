import type { Mail } from "../lib/mailer"

export async function renderTestMail(to: string, env: string, webUrl: string, at: Date): Promise<Mail> {
  const when = at.toISOString().replace("T", " ").slice(0, 16)
  return {
    to,
    subject: "Email de test Ceraghit",
    html: await (await import("./templates")).testHtml(env, when, webUrl, to),
    text: [
      "Cet email confirme que l'envoi depuis votre boutique fonctionne.",
      "",
      `Environnement : ${env}`,
      `Date : ${when} UTC`,
    ].join("\n"),
  }
}
