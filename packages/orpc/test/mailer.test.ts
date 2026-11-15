import { expect, test } from "bun:test"
import { type Mail, RedirectMailer } from "../src/lib/mailer"

function capture() {
  const sent: Mail[] = []
  return { sent, mailer: { send: async (mail: Mail) => void sent.push(mail) } }
}

test("a customer mail goes to the redirect inbox with the original recipient in subject and body", async () => {
  const { sent, mailer } = capture()
  await new RedirectMailer(mailer, "redirect@example.com", "pr-42").send({
    to: "test@example.com",
    subject: "Commande CG-1001",
    text: "Merci",
  })
  expect(sent).toEqual([
    {
      to: "redirect@example.com",
      subject: "[pr-42 → test@example.com] Commande CG-1001",
      text: "Destinataire d'origine : test@example.com\n\nMerci",
    },
  ])
})

test("replyTo is dropped and shown in the body instead", async () => {
  const { sent, mailer } = capture()
  await new RedirectMailer(mailer, "redirect@example.com", "local").send({
    to: "studio@example.com",
    subject: "Nouvelle commande",
    text: "CG-1001",
    replyTo: "test@example.com",
  })
  expect(sent[0]?.replyTo).toBeUndefined()
  expect(sent[0]?.text).toBe("Destinataire d'origine : studio@example.com\nRépondre à : test@example.com\n\nCG-1001")
})
