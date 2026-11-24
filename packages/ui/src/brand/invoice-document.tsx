import { countryName, formatMoney, INVOICE_COPY, type PublicInvoiceView, pick } from "@workspace/sdk"
import { LogoMark } from "./logo"

const dateFormat = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-TN-u-nu-latn" : locale, {
    dateStyle: "long",
    timeZone: "Africa/Tunis",
  }).format(new Date(iso))

export function InvoiceDocument({ view }: { view: PublicInvoiceView }) {
  const { locale, seller, customer } = view
  const t = INVOICE_COPY[locale]
  const money = (minor: number) => formatMoney(minor, view.currency, locale)
  const issued = view.number !== null
  const sellerName = seller.displayName ?? seller.legalName
  const sellerCity = [seller.postalCode, seller.city].filter(Boolean).join(" ")
  const note = seller.invoiceNote ? pick(seller.invoiceNote, locale) : ""
  const when = view.issuedAt ?? view.orderDate

  return (
    <article lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="invoice font-sans">
      <header className="invoice-head">
        <div className="flex items-start gap-3">
          <LogoMark className="size-14" />
          <div className="space-y-0.5 text-sm">
            <p className="font-heading text-lg">{sellerName}</p>
            {seller.legalName && seller.legalName !== sellerName && (
              <p>{[seller.legalName, seller.legalForm].filter(Boolean).join(" ")}</p>
            )}
            {seller.address && (
              <p>
                <bdi>{seller.address}</bdi>
              </p>
            )}
            {(sellerCity || seller.country) && (
              <p>
                <bdi>{sellerCity}</bdi>
                {sellerCity && ", "}
                {countryName(seller.country, locale)}
              </p>
            )}
            {seller.phone && <p dir="ltr">{seller.phone}</p>}
            {seller.email && <p dir="ltr">{seller.email}</p>}
            {seller.taxId && (
              <p>
                {t.taxId} : <bdi>{seller.taxId}</bdi>
              </p>
            )}
            {seller.registryNumber && (
              <p>
                {t.registry} : <bdi>{seller.registryNumber}</bdi>
              </p>
            )}
          </div>
        </div>
        <div className="space-y-0.5 text-end text-sm">
          <h1 className="text-3xl">{issued ? t.invoice : t.proforma}</h1>
          {issued ? (
            <p className="font-medium tabular-nums">
              {t.invoiceNo} <bdi dir="ltr">{view.number}</bdi>
            </p>
          ) : (
            <p>{t.notIssued}</p>
          )}
          <p>
            {t.date} : {dateFormat(when, locale)}
          </p>
          <p className="tabular-nums">
            {t.orderNo} <bdi dir="ltr">{view.orderNumber}</bdi>
          </p>
        </div>
      </header>

      <section className="invoice-block text-sm">
        <p className="invoice-label">{t.billedTo}</p>
        <p className="font-medium">{customer.name}</p>
        <p>
          <bdi>{customer.address}</bdi>
        </p>
        <p>
          <bdi>{[customer.postalCode, customer.city].filter(Boolean).join(" ")}</bdi>
          {(customer.postalCode || customer.city) && ", "}
          {countryName(customer.country, locale)}
        </p>
        <p dir="ltr" className="text-start">
          {customer.email} · {customer.phone}
        </p>
      </section>

      <table className="invoice-table">
        <thead>
          <tr>
            <th className="text-start">{t.item}</th>
            <th className="text-end">{t.qty}</th>
            <th className="text-end">{t.unitPrice}</th>
            <th className="text-end">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {view.items.map((item) => (
            <tr key={`${item.ref}-${item.title}`}>
              <td>
                <span className="tabular-nums">{item.ref}</span> {item.title}
              </td>
              <td className="text-end tabular-nums">{item.quantity}</td>
              <td className="text-end tabular-nums">{money(item.unitMinor)}</td>
              <td className="text-end tabular-nums">{money(item.unitMinor * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="invoice-totals tabular-nums">
        <div>
          <dt>{t.subtotal}</dt>
          <dd>{money(view.subtotalMinor)}</dd>
        </div>
        <div>
          <dt>{t.shipping}</dt>
          <dd>{money(view.shippingMinor)}</dd>
        </div>
        <div className="invoice-grand">
          <dt>{t.grandTotal}</dt>
          <dd>{money(view.totalMinor)}</dd>
        </div>
      </dl>

      <p className="invoice-block text-sm">
        {t.paymentMethod} : {t[view.paymentMethod]}.{" "}
        {view.paymentMethod === "cod"
          ? `${t.codDue}.`
          : view.paidAt
            ? `${t.paidOn} ${dateFormat(view.paidAt, locale)}.`
            : `${t.notPaid}.`}
      </p>

      {view.paymentReference && (view.paymentMethod === "transfer" || view.paymentMethod === "payoneer") && (
        <p className="invoice-block text-sm">
          {t.paymentReference} :{" "}
          <span dir="ltr" className="text-start">
            {view.paymentReference}
          </span>
        </p>
      )}

      {view.paymentMethod === "transfer" && seller.bank && (
        <section className="invoice-block text-sm">
          <p className="invoice-label">{t.bank}</p>
          <p>
            {t.bankHolder} : {seller.bank.holder}
          </p>
          <p>
            {t.bankName} : {seller.bank.bank}
          </p>
          {seller.bank.address && (
            <p>
              {t.bankAddress} : {seller.bank.address}
            </p>
          )}
          {seller.bank.iban && (
            <p dir="ltr" className="text-start">
              IBAN : {seller.bank.iban}
            </p>
          )}
          {seller.bank.rib && (
            <p dir="ltr" className="text-start">
              RIB : {seller.bank.rib}
            </p>
          )}
          {seller.bank.bic && (
            <p dir="ltr" className="text-start">
              BIC : {seller.bank.bic}
            </p>
          )}
        </section>
      )}

      {note && <p className="invoice-block whitespace-pre-line text-muted-foreground text-xs">{note}</p>}
    </article>
  )
}
