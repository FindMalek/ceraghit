import { expect, test } from "bun:test"
import { ConsoleMailer, type Mail, MailpitMailer, RedirectMailer } from "../src/lib/mailer"

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

test("MailpitMailer posts the mail to the send api", async () => {
  const calls: { url: string; body: unknown }[] = []
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response("{}")
  }) as unknown as typeof fetch
  await new MailpitMailer("http://mail:8025/", "Ceraghit <commandes@example.com>", http).send({
    to: "test@example.com",
    subject: "Commande CG-1001",
    text: "Merci",
    replyTo: "studio@example.com",
  })
  expect(calls).toEqual([
    {
      url: "http://mail:8025/api/v1/send",
      body: {
        From: { Email: "commandes@example.com", Name: "Ceraghit" },
        To: [{ Email: "test@example.com" }],
        ReplyTo: [{ Email: "studio@example.com" }],
        Subject: "Commande CG-1001",
        Text: "Merci",
      },
    },
  ])
})

test("MailpitMailer throws when mailpit answers an error", async () => {
  const http = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch
  expect(
    new MailpitMailer("http://mail:8025", "commandes@example.com", http).send({ to: "a@b.c", subject: "s", text: "t" }),
  ).rejects.toThrow(/mailpit 500/)
})

test("ConsoleMailer logs the whole body", async () => {
  const logged: string[] = []
  const info = console.info
  console.info = (line: string) => void logged.push(line)
  try {
    await new ConsoleMailer().send({ to: "a@b.c", subject: "Sujet", text: "ligne 1\nligne 2" })
  } finally {
    console.info = info
  }
  expect(logged).toEqual(["[mail] to a@b.c: Sujet\n  ligne 1\n  ligne 2"])
})
