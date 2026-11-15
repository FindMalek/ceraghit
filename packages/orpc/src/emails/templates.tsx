import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"
import { type Currency, formatMoney } from "@workspace/sdk"
import type { CSSProperties, ReactNode } from "react"
import { mailColors as c, MAIL_SERIF } from "./brand"
import type { ConfirmationOrder, MailContext } from "./confirmation"
import { asLocale, EMAIL_COPY, type Locale } from "./copy"
import { ltr, type MailOrder } from "./layout"
import { orderUrl } from "./order-url"
import type { StudioRequest } from "./request"

const font = { fontFamily: MAIL_SERIF, color: c.goldBright, fontSize: "16px", lineHeight: "1.6" }
const title: CSSProperties = { ...font, color: c.goldTitle, fontSize: "26px", fontWeight: 300, margin: "0 0 16px" }
const para: CSSProperties = { ...font, margin: "0 0 12px" }
const rule: CSSProperties = { borderColor: c.gold, borderTop: "1px solid", margin: "16px 0" }

interface LayoutProps {
  locale: Locale
  preview: string
  webUrl: string
  contactEmail: string
  /** Why the reader gets this mail; studio mails have none. */
  reason?: string
  children: ReactNode
}

/** The frame every mail shares: ink background, logo, gold rules, studio footer. */
export function EmailLayout({ locale, preview, webUrl, contactEmail, reason, children }: LayoutProps) {
  const rtl = locale === "ar"
  const start = rtl ? "right" : "left"
  return (
    <Html lang={locale} dir={rtl ? "rtl" : "ltr"}>
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <style>{":root{color-scheme:dark;supported-color-schemes:dark}"}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: c.ink, margin: 0, padding: "24px 12px", textAlign: start }}>
        <Container
          dir={rtl ? "rtl" : "ltr"}
          style={{ backgroundColor: c.inkRaised, border: `1px solid ${c.gold}`, maxWidth: "600px", width: "100%" }}
        >
          <Section style={{ padding: "24px 24px 0", textAlign: "center" }}>
            <Img
              src={`${webUrl}/logo-mail.png`}
              alt="Ceraghit Creation"
              width="96"
              height="96"
              style={{ margin: "0 auto" }}
            />
          </Section>
          <Section style={{ padding: "0 24px", textAlign: start }}>
            <Hr style={rule} />
            {children}
            <Hr style={rule} />
            <Text style={{ ...para, color: c.gold, fontSize: "13px", margin: "0 0 4px" }}>
              Ceraghit Creation ·{" "}
              <Link href={`mailto:${contactEmail}`} style={{ color: c.goldBright }}>
                {ltr(contactEmail, locale)}
              </Link>
            </Text>
            {reason ? <Text style={{ ...para, color: c.gold, fontSize: "12px" }}>{reason}</Text> : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

function Line({
  left,
  right,
  locale,
  strong,
}: {
  left: ReactNode
  right: ReactNode
  locale: Locale
  strong?: boolean
}) {
  const end = locale === "ar" ? "left" : "right"
  const s = { ...para, margin: "0 0 6px", ...(strong ? { color: c.goldTitle } : {}) }
  return (
    <Row>
      <Column style={{ verticalAlign: "top" }}>
        <Text style={s}>{left}</Text>
      </Column>
      <Column style={{ verticalAlign: "top", textAlign: end, whiteSpace: "nowrap", paddingInlineStart: "12px" }}>
        <Text style={s}>{right}</Text>
      </Column>
    </Row>
  )
}

function Items({ order, locale }: { order: MailOrder; locale: Locale }) {
  const money = (minor: number) => formatMoney(minor, order.currency as Currency, locale)
  return (
    <Section dir={locale === "ar" ? "rtl" : "ltr"}>
      {order.items.map((i) => (
        <Line
          key={i.ref}
          locale={locale}
          left={`${ltr(i.ref, locale)} ${i.title} ${ltr(`x ${i.quantity}`, locale)}`}
          right={money(i.unitMinor * i.quantity)}
        />
      ))}
    </Section>
  )
}

function Totals({ order, locale }: { order: MailOrder; locale: Locale }) {
  const k = EMAIL_COPY[locale].common
  const money = (minor: number) => formatMoney(minor, order.currency as Currency, locale)
  return (
    <Section dir={locale === "ar" ? "rtl" : "ltr"}>
      <Hr style={rule} />
      <Line locale={locale} left={k.subtotal} right={money(order.subtotalMinor)} />
      <Line locale={locale} left={k.shipping} right={money(order.shippingMinor)} />
      <Line locale={locale} left={k.total} right={money(order.totalMinor)} strong />
    </Section>
  )
}

function Bank({ order, ctx, locale }: { order: ConfirmationOrder; ctx: MailContext; locale: Locale }) {
  const k = EMAIL_COPY[locale].confirmation
  const bank = ctx.bank
  if (!bank) return <Text style={para}>{k.bankMissing(ltr(ctx.contactEmail, locale))}</Text>
  const rows: [string, string][] = [
    [k.holder, bank.holder],
    [k.bank, bank.bank],
    ...(bank.rib ? [["RIB", ltr(bank.rib, locale)] as [string, string]] : []),
    ...(bank.iban ? [["IBAN", ltr(bank.iban, locale)] as [string, string]] : []),
    ...(bank.bic ? [["BIC", ltr(bank.bic, locale)] as [string, string]] : []),
    [k.reference, ltr(order.number, locale)],
  ]
  return (
    <Section
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={{ backgroundColor: c.inkSoft, padding: "12px 16px", margin: "16px 0" }}
    >
      <Text style={{ ...para, color: c.goldTitle, margin: "0 0 8px" }}>{k.bankTitle}</Text>
      {rows.map(([label, value]) => (
        <Line key={label} locale={locale} left={label} right={value} />
      ))}
    </Section>
  )
}

function TrackLink({ href, locale }: { href: string; locale: Locale }) {
  return (
    <Text style={para}>
      {EMAIL_COPY[locale].common.link}{" "}
      <Link href={href} style={{ color: c.goldTitle }}>
        {ltr(href, locale)}
      </Link>
    </Text>
  )
}

interface CustomerProps {
  order: ConfirmationOrder
  ctx: MailContext
  preview: string
  intro: string
  withBank: boolean
}

function CustomerOrder({ order, ctx, preview, intro, withBank }: CustomerProps) {
  const locale = asLocale(order.locale)
  const c1 = EMAIL_COPY[locale]
  return (
    <EmailLayout
      locale={locale}
      preview={preview}
      webUrl={ctx.webUrl}
      contactEmail={ctx.contactEmail}
      reason={c1.common.reason}
    >
      <Text style={title}>{c1.common.hello(order.customerName)}</Text>
      <Text style={para}>{intro}</Text>
      <Items order={order} locale={locale} />
      <Totals order={order} locale={locale} />
      {withBank ? <Bank order={order} ctx={ctx} locale={locale} /> : null}
      <TrackLink href={orderUrl(ctx.webUrl, order)} locale={locale} />
      <Text style={para}>{c1.common.bye}</Text>
    </EmailLayout>
  )
}

export function ConfirmationEmail({ order, ctx }: { order: ConfirmationOrder; ctx: MailContext }) {
  const k = EMAIL_COPY[asLocale(order.locale)].confirmation
  const transfer = order.paymentMethod === "transfer"
  return (
    <CustomerOrder
      order={order}
      ctx={ctx}
      preview={k.subject(order.number)}
      intro={order.paymentMethod === "cod" ? k.cod : transfer ? k.transfer : k.paid}
      withBank={transfer}
    />
  )
}

export function PaymentReceivedEmail({ order, ctx }: { order: ConfirmationOrder; ctx: MailContext }) {
  const k = EMAIL_COPY[asLocale(order.locale)].confirmation
  return <CustomerOrder order={order} ctx={ctx} preview={k.subject(order.number)} intro={k.paid} withBank={false} />
}

/** Studio mails stay in French. */
export function StudioOrderEmail({
  order,
  ctx,
  headline,
  status,
}: {
  order: ConfirmationOrder
  ctx: MailContext
  headline: string
  status: string
}) {
  return (
    <EmailLayout locale="fr" preview={headline} webUrl={ctx.webUrl} contactEmail={ctx.contactEmail}>
      <Text style={title}>{headline}</Text>
      <Text style={para}>
        {order.customerName} &lt;{order.email}&gt; {order.phone}
        <br />
        {order.address}, {[order.postalCode, order.city].filter(Boolean).join(" ")}, {order.country}
      </Text>
      {order.note ? <Text style={para}>Note: {order.note}</Text> : null}
      <Items order={order} locale="fr" />
      <Totals order={order} locale="fr" />
      <Text style={para}>{status}</Text>
    </EmailLayout>
  )
}

export function RequestEmail({
  request,
  webUrl,
  contactEmail,
}: {
  request: StudioRequest
  webUrl: string
  contactEmail: string
}) {
  const extra = [
    request.dimensions ? `Dimensions : ${request.dimensions}` : "",
    request.budget ? `Budget : ${request.budget}` : "",
    request.references ? `Références : ${request.references}` : "",
  ].filter(Boolean)
  return (
    <EmailLayout
      locale="fr"
      preview={`Nouvelle demande de pièce unique : ${request.name}`}
      webUrl={webUrl}
      contactEmail={contactEmail}
    >
      <Text style={title}>Nouvelle demande de pièce unique</Text>
      <Text style={para}>
        {request.name} &lt;{request.email}&gt;
        {request.phone ? ` ${request.phone}` : ""}
        {request.country ? ` (${request.country})` : ""}
      </Text>
      <Text style={{ ...para, whiteSpace: "pre-wrap" }}>{request.description}</Text>
      {extra.map((line) => (
        <Text key={line} style={{ ...para, margin: "0 0 4px" }}>
          {line}
        </Text>
      ))}
      {request.images.length ? (
        <Text style={para}>{request.images.length} photo(s) à voir dans le dashboard.</Text>
      ) : null}
      <Text style={para}>Répondez directement à cet email pour écrire au client.</Text>
    </EmailLayout>
  )
}

export const confirmationHtml = (order: ConfirmationOrder, ctx: MailContext) =>
  render(<ConfirmationEmail order={order} ctx={ctx} />)
export const paymentReceivedHtml = (order: ConfirmationOrder, ctx: MailContext) =>
  render(<PaymentReceivedEmail order={order} ctx={ctx} />)
export const studioOrderHtml = (order: ConfirmationOrder, ctx: MailContext, headline: string, status: string) =>
  render(<StudioOrderEmail order={order} ctx={ctx} headline={headline} status={status} />)
export const requestHtml = (request: StudioRequest, webUrl: string, contactEmail: string) =>
  render(<RequestEmail request={request} webUrl={webUrl} contactEmail={contactEmail} />)
